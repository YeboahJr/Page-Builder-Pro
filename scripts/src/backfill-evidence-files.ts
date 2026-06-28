import { Storage } from "@google-cloud/storage";
import { db, evidenceFilesTable, pool } from "@workspace/db";
import { inArray } from "drizzle-orm";
import path from "path";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parsePrivateObjectDir(dir: string): { bucketName: string; gcsPrefix: string } {
  const normalized = dir.replace(/^\//, "");
  const slashIdx = normalized.indexOf("/");
  if (slashIdx === -1) return { bucketName: normalized, gcsPrefix: "" };
  return {
    bucketName: normalized.slice(0, slashIdx),
    gcsPrefix: normalized.slice(slashIdx + 1),
  };
}

const extToMime: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
};

function deriveMimetype(metadataContentType: string | undefined, filename: string): string {
  if (metadataContentType) return metadataContentType;
  const ext = path.extname(filename).toLowerCase();
  return extToMime[ext] ?? "application/octet-stream";
}

async function main() {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error("PRIVATE_OBJECT_DIR not set — cannot enumerate evidence objects");
  }

  const { bucketName, gcsPrefix } = parsePrivateObjectDir(privateObjectDir);
  const bucket = objectStorageClient.bucket(bucketName);

  // Evidence objects live at: <gcsPrefix>/case-<id>/<filename>
  const listPrefix = gcsPrefix ? `${gcsPrefix}/` : "";
  const [files] = await bucket.getFiles({ prefix: listPrefix });

  // case-<id>/<filename> relative to the gcsPrefix
  const caseObjectRe = /^case-(\d+)\/(.+)$/;

  type Candidate = {
    caseId: number;
    objectPath: string;
    originalName: string;
    mimetype: string;
    size: number;
  };

  const candidates: Candidate[] = [];

  for (const file of files) {
    const relative = gcsPrefix ? file.name.slice(gcsPrefix.length + 1) : file.name;
    const match = caseObjectRe.exec(relative);
    if (!match) continue;

    const caseId = parseInt(match[1], 10);
    const filename = match[2];
    // Skip "directory placeholder" objects (names ending with a slash).
    if (!filename || filename.endsWith("/")) continue;

    const objectPath = `/objects/case-${caseId}/${filename}`;
    const size = file.metadata.size != null ? Number(file.metadata.size) : 0;
    const mimetype = deriveMimetype(file.metadata.contentType, filename);

    candidates.push({
      caseId,
      objectPath,
      originalName: filename,
      mimetype,
      size,
    });
  }

  console.log(`Found ${candidates.length} evidence object(s) under "${listPrefix || "(bucket root)"}"`);

  if (candidates.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  // Idempotency: skip objects that already have a row.
  const objectPaths = candidates.map((c) => c.objectPath);
  const existing = await db
    .select({ objectPath: evidenceFilesTable.objectPath })
    .from(evidenceFilesTable)
    .where(inArray(evidenceFilesTable.objectPath, objectPaths));
  const existingSet = new Set(existing.map((e) => e.objectPath));

  const toInsert = candidates.filter((c) => !existingSet.has(c.objectPath));

  console.log(`${existingSet.size} already present, ${toInsert.length} to insert.`);

  if (toInsert.length === 0) {
    console.log("All evidence objects already backfilled. Nothing to do.");
    return;
  }

  await db.insert(evidenceFilesTable).values(
    toInsert.map((c) => ({
      caseId: c.caseId,
      objectPath: c.objectPath,
      originalName: c.originalName,
      mimetype: c.mimetype,
      size: c.size,
      uploadedBy: null,
    }))
  );

  console.log(`Inserted ${toInsert.length} evidence_files row(s).`);
  for (const c of toInsert) {
    console.log(`  + case-${c.caseId}: ${c.objectPath} (${c.mimetype}, ${c.size} bytes)`);
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Backfill failed:", err);
    await pool.end();
    process.exit(1);
  });
