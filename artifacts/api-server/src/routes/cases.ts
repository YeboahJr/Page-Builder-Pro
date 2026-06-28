import { Router } from "express";
import { db, casesTable, casePersonsTable, caseAgentsTable, caseStatusHistoryTable, evidenceFilesTable, sessionsTable, officersTable } from "@workspace/db";
import { eq, ilike, and, gte, lte, desc, or } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../lib/objectStorage";

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), "uploads");

function parsePrivateObjectDir(dir: string): { bucketName: string; gcsPrefix: string } {
  const normalized = dir.replace(/^\//, "");
  const slashIdx = normalized.indexOf("/");
  if (slashIdx === -1) return { bucketName: normalized, gcsPrefix: "" };
  return {
    bucketName: normalized.slice(0, slashIdx),
    gcsPrefix: normalized.slice(slashIdx + 1),
  };
}

const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /image\/(jpeg|png|gif|webp)|video\/(mp4|webm|mov|avi|mkv)/;
    cb(null, allowed.test(file.mimetype));
  },
});

async function resolveOfficerName(req: { headers: { authorization?: string }; cookies?: { auth_token?: string } }): Promise<string | null> {
  const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.auth_token;
  if (!token) return null;
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token));
  if (!session || session.expiresAt < new Date()) return null;
  const [officer] = await db.select().from(officersTable).where(eq(officersTable.id, session.officerId));
  return officer ? officer.name : null;
}

const router = Router();

router.get("/", async (req, res) => {
  const { status, priority, category, search, caseNumber, suspectName, vehiclePlate, missionNumber, dateFrom, dateTo } = req.query;

  const conditions = [];

  if (status) conditions.push(eq(casesTable.status, status as string));
  if (priority) conditions.push(eq(casesTable.priority, priority as string));
  if (category) conditions.push(eq(casesTable.category, category as string));
  if (caseNumber) conditions.push(ilike(casesTable.caseNumber, `%${caseNumber}%`));
  if (search) conditions.push(or(ilike(casesTable.title, `%${search}%`), ilike(casesTable.caseNumber, `%${search}%`)));
  if (dateFrom) conditions.push(gte(casesTable.createdAt, new Date(dateFrom as string)));
  if (dateTo) conditions.push(lte(casesTable.createdAt, new Date(dateTo as string)));

  const results = conditions.length
    ? await db.select().from(casesTable).where(and(...conditions)).orderBy(desc(casesTable.updatedAt))
    : await db.select().from(casesTable).orderBy(desc(casesTable.updatedAt));

  res.json(results.map(c => ({
    ...c,
    lastModified: c.updatedAt.toISOString().split("T")[0],
    createdAt: c.createdAt.toISOString().split("T")[0],
    description: c.description ?? null,
    closedAt: c.closedAt?.toISOString() ?? null,
  })));
});

router.post("/", async (req, res) => {
  const { title, category, priority, status, leadAgent, description } = req.body;

  const allCases = await db.select({ id: casesTable.id }).from(casesTable);
  const nextNum = String(allCases.length + 1).padStart(4, "0");
  const caseNumber = `SID-2026-${nextNum}`;

  const [newCase] = await db.insert(casesTable).values({
    caseNumber,
    title,
    category,
    priority: priority || "Mittel",
    status: status || "Offen",
    leadAgent,
    description,
  }).returning();

  await db.insert(caseAgentsTable).values({ caseId: newCase.id, name: leadAgent, role: "Leitender Agent" });
  await db.insert(caseStatusHistoryTable).values({ caseId: newCase.id, fromStatus: "Neu", toStatus: status || "Offen", changedBy: leadAgent });

  res.status(201).json({
    ...newCase,
    lastModified: newCase.updatedAt.toISOString().split("T")[0],
    createdAt: newCase.createdAt.toISOString().split("T")[0],
    description: newCase.description ?? null,
    closedAt: null,
  });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [c] = await db.select().from(casesTable).where(eq(casesTable.id, id));
  if (!c) { res.status(404).json({ error: "Fall nicht gefunden" }); return; }

  const agents = await db.select().from(caseAgentsTable).where(eq(caseAgentsTable.caseId, id));
  const leadAgent = agents.find(a => a.role === "Leitender Agent");
  const supporting = agents.filter(a => a.role !== "Leitender Agent" && a.role !== "Supervisor").map(a => a.name);
  const supervisor = agents.find(a => a.role === "Supervisor")?.name ?? null;

  res.json({
    ...c,
    lastModified: c.updatedAt.toISOString().split("T")[0],
    createdAt: c.createdAt.toISOString().split("T")[0],
    supportingAgents: supporting,
    supervisor,
    description: c.description ?? null,
    closedAt: c.closedAt?.toISOString() ?? null,
  });
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(casesTable).where(eq(casesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Fall nicht gefunden" }); return; }

  const { title, category, priority, status, leadAgent, description } = req.body;
  const updates: Partial<typeof casesTable.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (category !== undefined) updates.category = category;
  if (priority !== undefined) updates.priority = priority;
  if (status !== undefined) updates.status = status;
  if (leadAgent !== undefined) updates.leadAgent = leadAgent;
  if (description !== undefined) updates.description = description;

  if (status && status !== existing.status) {
    await db.insert(caseStatusHistoryTable).values({
      caseId: id,
      fromStatus: existing.status,
      toStatus: status,
      changedBy: leadAgent || existing.leadAgent,
    });
  }

  const [updated] = await db.update(casesTable).set(updates).where(eq(casesTable.id, id)).returning();
  res.json({
    ...updated,
    lastModified: updated.updatedAt.toISOString().split("T")[0],
    createdAt: updated.createdAt.toISOString().split("T")[0],
    description: updated.description ?? null,
    closedAt: updated.closedAt?.toISOString() ?? null,
  });
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }

  // Don't report a successful deletion for a case that never existed — otherwise
  // the client removes a row that was never there and the failure goes unnoticed.
  const [existing] = await db.select({ id: casesTable.id }).from(casesTable).where(eq(casesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Fall nicht gefunden" });
    return;
  }

  // Delete associated evidence files from object storage before removing the case,
  // so we don't leave orphaned GCS objects under the case-<id>/ prefix.
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (privateObjectDir) {
    const { bucketName, gcsPrefix } = parsePrivateObjectDir(privateObjectDir);
    const bucket = objectStorageClient.bucket(bucketName);
    const gcsListPrefix = gcsPrefix ? `${gcsPrefix}/case-${id}/` : `case-${id}/`;
    try {
      await bucket.deleteFiles({ prefix: gcsListPrefix, force: true });
    } catch (err) {
      req.log.error({ err }, "Failed to delete GCS evidence files during case deletion");
      res.status(500).json({ error: "Beweismittel konnten nicht gelöscht werden" });
      return;
    }
  }

  // Also clean up any local fallback copies for this case.
  const localDir = path.join(LOCAL_UPLOADS_DIR, `case-${id}`);
  if (fs.existsSync(localDir)) {
    fs.rmSync(localDir, { recursive: true, force: true });
  }

  // Remove the case and all its child rows atomically. If any delete fails the
  // whole thing rolls back and the error propagates as a 500, so the client
  // never sees a partially-deleted case reported as success.
  try {
    await db.transaction(async (tx) => {
      await tx.delete(evidenceFilesTable).where(eq(evidenceFilesTable.caseId, id));
      await tx.delete(casePersonsTable).where(eq(casePersonsTable.caseId, id));
      await tx.delete(caseAgentsTable).where(eq(caseAgentsTable.caseId, id));
      await tx.delete(caseStatusHistoryTable).where(eq(caseStatusHistoryTable.caseId, id));
      await tx.delete(casesTable).where(eq(casesTable.id, id));
    });
  } catch (err) {
    req.log.error({ err }, "Failed to delete case from database");
    res.status(500).json({ error: "Fall konnte nicht gelöscht werden" });
    return;
  }

  res.status(204).send();
});

router.get("/:id/status-history", async (req, res) => {
  const id = parseInt(req.params.id);
  const history = await db.select().from(caseStatusHistoryTable)
    .where(eq(caseStatusHistoryTable.caseId, id))
    .orderBy(desc(caseStatusHistoryTable.timestamp));
  res.json(history.map(h => ({ ...h, timestamp: h.timestamp.toISOString() })));
});

router.get("/:id/persons", async (req, res) => {
  const id = parseInt(req.params.id);
  const persons = await db.select().from(casePersonsTable).where(eq(casePersonsTable.caseId, id));
  res.json(persons.map(p => ({ ...p, formerIds: p.formerIds ?? null, lastLocation: p.lastLocation ?? null })));
});

router.get("/:id/agents", async (req, res) => {
  const id = parseInt(req.params.id);
  const agents = await db.select().from(caseAgentsTable).where(eq(caseAgentsTable.caseId, id));
  res.json(agents);
});

router.post("/:id/evidence/upload", upload.array("files", 20), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;

  if (!privateObjectDir) {
    req.log.error("PRIVATE_OBJECT_DIR not set — cannot upload to object storage");
    res.status(500).json({ error: "Object storage nicht konfiguriert" });
    return;
  }

  const { bucketName, gcsPrefix } = parsePrivateObjectDir(privateObjectDir);
  const bucket = objectStorageClient.bucket(bucketName);
  const caseId = parseInt(String(req.params.id));
  const uploadedBy = await resolveOfficerName(req);

  const results = await Promise.all(files.map(async (f) => {
    const ext = path.extname(f.originalname);
    const unique = `${Date.now()}-${randomUUID()}${ext}`;
    // Object name in GCS: <gcsPrefix>/case-<id>/<unique>  (e.g. ".private/case-1/uuid.jpg")
    // entityId passed to getObjectEntityFile: case-<id>/<unique>  (prefix is stripped by the service)
    const objectName = gcsPrefix ? `${gcsPrefix}/case-${req.params.id}/${unique}` : `case-${req.params.id}/${unique}`;
    const gcsFile = bucket.file(objectName);
    await gcsFile.save(f.buffer, { contentType: f.mimetype, resumable: false });
    // objectPath = /objects/<entityId> where entityId is relative to PRIVATE_OBJECT_DIR
    const objectPath = `/objects/case-${req.params.id}/${unique}`;

    const [row] = await db.insert(evidenceFilesTable).values({
      caseId,
      objectPath,
      originalName: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      uploadedBy,
    }).returning();

    return {
      name: f.originalname,
      filename: unique,
      mimetype: f.mimetype,
      size: f.size,
      url: `/api/storage${objectPath}`,
      objectPath,
      uploadedBy: row.uploadedBy,
      uploadedAt: row.uploadedAt.toISOString(),
    };
  }));

  res.json({ uploaded: results.length, files: results });
});

router.delete("/:id/evidence/:filename", async (req, res) => {
  const { id, filename } = req.params;
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;

  if (!privateObjectDir) {
    res.status(500).json({ error: "Object storage nicht konfiguriert" });
    return;
  }

  const { bucketName, gcsPrefix } = parsePrivateObjectDir(privateObjectDir);
  const bucket = objectStorageClient.bucket(bucketName);
  const objectName = gcsPrefix
    ? `${gcsPrefix}/case-${id}/${filename}`
    : `case-${id}/${filename}`;

  try {
    await bucket.file(objectName).delete();
  } catch (err) {
    req.log.warn({ err }, "Failed to delete GCS evidence file");
    res.status(404).json({ error: "Datei nicht gefunden" });
    return;
  }

  // Remove the DB metadata row so the file no longer shows up in listings.
  const objectPath = `/objects/case-${id}/${filename}`;
  await db.delete(evidenceFilesTable).where(eq(evidenceFilesTable.objectPath, objectPath));

  // Also clean up local fallback copy if it exists
  const localPath = path.join(LOCAL_UPLOADS_DIR, `case-${id}`, filename);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
  }

  res.status(204).send();
});

router.get("/:id/evidence/files", async (req, res) => {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  const caseId = req.params.id;

  const imageExts = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
  const videoExts = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]);

  function classifyType(mimetype: string, filename: string): string {
    if (mimetype.startsWith("image/")) return "image";
    if (mimetype.startsWith("video/")) return "video";
    const ext = path.extname(filename).toLowerCase();
    if (imageExts.has(ext)) return "image";
    if (videoExts.has(ext)) return "video";
    return "other";
  }

  type FileEntry = { filename: string; url: string; objectPath: string; type: string; size: number; uploadedAt: string; uploadedBy: string | null };

  // Read evidence file metadata from the DB (source of truth — avoids GCS round-trips).
  const rows = await db.select().from(evidenceFilesTable)
    .where(eq(evidenceFilesTable.caseId, parseInt(caseId)))
    .orderBy(desc(evidenceFilesTable.uploadedAt));

  const dbFiles: FileEntry[] = rows.map((r) => {
    const filename = r.objectPath.slice(r.objectPath.lastIndexOf("/") + 1);
    return {
      filename,
      url: `/api/storage${r.objectPath}`,
      objectPath: r.objectPath,
      type: classifyType(r.mimetype, r.originalName),
      size: r.size,
      uploadedAt: r.uploadedAt.toISOString(),
      uploadedBy: r.uploadedBy,
    };
  });

  // Fallback: also include any pre-existing local files (backward compatibility)
  const localDir = path.join(LOCAL_UPLOADS_DIR, `case-${caseId}`);
  const localFiles: FileEntry[] = [];
  if (fs.existsSync(localDir)) {
    const names = fs.readdirSync(localDir);
    for (const name of names) {
      const ext = path.extname(name).toLowerCase();
      const stat = fs.statSync(path.join(localDir, name));
      localFiles.push({
        filename: name,
        url: `/api/uploads/case-${caseId}/${name}`,
        objectPath: "",
        type: imageExts.has(ext) ? "image" : videoExts.has(ext) ? "video" : "other",
        size: stat.size,
        uploadedAt: stat.mtime.toISOString(),
        uploadedBy: null,
      });
    }
  }

  res.json({ files: [...dbFiles, ...localFiles] });
});

export default router;
