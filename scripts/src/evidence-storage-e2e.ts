// On-demand integration check for the evidence file flow against REAL object storage.
//
// Exercises the full live path the unit tests in lib/object-storage can't:
//   1. Upload a file to a case via POST /api/cases/:id/evidence/upload
//   2. Verify the DB row's /objects path and that the object exists in GCS
//   3. Fetch the file back through its stored path (GET /api/storage/objects/...)
//      and assert the content matches byte-for-byte
//   4. Delete via DELETE /api/cases/:id/evidence/:filename and assert the DB row
//      AND the GCS object are both gone (and the download now 404s)
//
// Run:  pnpm --filter @workspace/scripts run evidence-storage-e2e
//
// Requires: DATABASE_URL, PRIVATE_OBJECT_DIR, and the API server workflow running
// (reachable through the shared proxy at localhost:80/api by default; override
// with API_BASE_URL). Creates a temporary officer, session and case, and cleans
// everything up afterwards — even on failure.

import crypto from "crypto";
import {
  db,
  officersTable,
  sessionsTable,
  casesTable,
  caseAgentsTable,
  caseStatusHistoryTable,
  evidenceFilesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  objectStorageClient,
  parsePrivateObjectDir,
  evidenceObjectName,
} from "@workspace/object-storage";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:80/api";

// Must match hashPassword in artifacts/api-server/src/lib/auth.ts (only used to
// create the throwaway test officer; we never log in through the UI).
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "fib_salt_2026").digest("hex");
}

let passed = 0;
function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    throw new Error(`Assertion failed: ${label}`);
  }
}

async function main() {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

  const { bucketName, gcsPrefix } = parsePrivateObjectDir(privateObjectDir);
  const bucket = objectStorageClient.bucket(bucketName);

  const runId = crypto.randomBytes(4).toString("hex");
  const officerName = `E2E Storage Check ${runId}`;

  let officerId: number | null = null;
  let sessionToken: string | null = null;
  let caseId: number | null = null;
  let uploadedFilename: string | null = null;

  try {
    // --- Setup: temp officer (leadership → full case access) + session ---
    const [officer] = await db.insert(officersTable).values({
      dienstnummer: `E2E-${runId}`,
      name: officerName,
      rank: "Division Chief",
      passwortHash: hashPassword(crypto.randomBytes(16).toString("hex")),
      freigegeben: true,
    }).returning();
    officerId = officer.id;

    sessionToken = crypto.randomBytes(32).toString("hex");
    await db.insert(sessionsTable).values({
      officerId: officer.id,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    const authHeaders = { Authorization: `Bearer ${sessionToken}` };

    // --- Setup: create a case via the API ---
    console.log("Creating test case via API...");
    const caseRes = await fetch(`${API_BASE}/cases`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `E2E Evidence Storage Check ${runId}`,
        category: "Sonstiges",
        leadAgent: officerName,
      }),
    });
    if (caseRes.status !== 201) {
      throw new Error(`Case creation failed: ${caseRes.status} ${await caseRes.text()}`);
    }
    caseId = (await caseRes.json() as { id: number }).id;
    console.log(`  Case #${caseId} created`);

    // --- 1. Upload ---
    console.log("Uploading evidence file...");
    // The upload route only accepts image/video mimetypes (multer fileFilter),
    // so send a tiny valid PNG plus a unique payload trailer for content checks.
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const content = Buffer.concat([
      pngHeader,
      Buffer.from(`SIDMS evidence e2e check ${runId} @ ${new Date().toISOString()}`),
    ]);
    const form = new FormData();
    form.append("files", new Blob([content], { type: "image/png" }), `e2e-check-${runId}.png`);

    const uploadRes = await fetch(`${API_BASE}/cases/${caseId}/evidence/upload`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });
    if (uploadRes.status !== 200) {
      throw new Error(`Upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
    }
    const uploadBody = await uploadRes.json() as {
      uploaded: number;
      files: { filename: string; objectPath: string; url: string; size: number }[];
    };
    assert(uploadBody.uploaded === 1, "upload response reports 1 file");
    const uploaded = uploadBody.files[0];
    uploadedFilename = uploaded.filename;
    assert(
      uploaded.objectPath === `/objects/case-${caseId}/${uploaded.filename}`,
      `objectPath follows /objects/case-<id>/<filename> scheme (${uploaded.objectPath})`,
    );

    // --- 2. DB row + GCS object exist ---
    const rowsAfterUpload = await db.select().from(evidenceFilesTable)
      .where(eq(evidenceFilesTable.objectPath, uploaded.objectPath));
    assert(rowsAfterUpload.length === 1, "evidence_files row exists after upload");
    assert(rowsAfterUpload[0].caseId === caseId, "DB row references the right case");
    assert(rowsAfterUpload[0].size === content.length, "DB row records the correct size");

    const objectName = evidenceObjectName(gcsPrefix, caseId, uploaded.filename);
    const [existsAfterUpload] = await bucket.file(objectName).exists();
    assert(existsAfterUpload, `GCS object exists at ${objectName}`);

    // --- 3. Download through the stored /objects path ---
    console.log("Fetching file back through its stored /objects path...");
    const downloadRes = await fetch(`${API_BASE}/storage${uploaded.objectPath}`, {
      headers: authHeaders,
    });
    assert(downloadRes.status === 200, "download through /api/storage/objects returns 200");
    const downloadedBytes = Buffer.from(await downloadRes.arrayBuffer());
    assert(downloadedBytes.equals(content), "downloaded content matches uploaded content byte-for-byte");

    // --- 4. Delete removes DB row + GCS object ---
    console.log("Deleting evidence file via API...");
    const deleteRes = await fetch(
      `${API_BASE}/cases/${caseId}/evidence/${uploaded.filename}`,
      { method: "DELETE", headers: authHeaders },
    );
    assert(deleteRes.status === 204, "delete returns 204");

    const rowsAfterDelete = await db.select().from(evidenceFilesTable)
      .where(eq(evidenceFilesTable.objectPath, uploaded.objectPath));
    assert(rowsAfterDelete.length === 0, "evidence_files row removed after delete");

    const [existsAfterDelete] = await bucket.file(objectName).exists();
    assert(!existsAfterDelete, "GCS object removed after delete");

    const downloadAfterDelete = await fetch(`${API_BASE}/storage${uploaded.objectPath}`, {
      headers: authHeaders,
    });
    assert(downloadAfterDelete.status === 404, "download after delete returns 404");
    uploadedFilename = null;

    console.log(`\nAll ${passed} checks passed — evidence upload/download/delete work end-to-end against real storage.`);
  } finally {
    // --- Cleanup (best effort, runs even on failure) ---
    console.log("Cleaning up test data...");
    try {
      if (uploadedFilename !== null && caseId !== null) {
        const objectName = evidenceObjectName(gcsPrefix, caseId, uploadedFilename);
        await bucket.file(objectName).delete({ ignoreNotFound: true });
      }
      if (caseId !== null) {
        await db.delete(evidenceFilesTable).where(eq(evidenceFilesTable.caseId, caseId));
        await db.delete(caseAgentsTable).where(eq(caseAgentsTable.caseId, caseId));
        await db.delete(caseStatusHistoryTable).where(eq(caseStatusHistoryTable.caseId, caseId));
        await db.delete(casesTable).where(eq(casesTable.id, caseId));
      }
      if (sessionToken !== null) {
        await db.delete(sessionsTable).where(eq(sessionsTable.token, sessionToken));
      }
      if (officerId !== null) {
        await db.delete(officersTable).where(eq(officersTable.id, officerId));
      }
    } catch (err) {
      console.error("Cleanup failed (manual cleanup may be needed):", err);
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`\nFAILED after ${passed} passing checks:`);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
