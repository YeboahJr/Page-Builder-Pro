import { Router } from "express";
import { db, casesTable, casePersonsTable, caseAgentsTable, caseStatusHistoryTable, evidenceFilesTable, officersTable } from "@workspace/db";
import { eq, ilike, and, gte, lte, desc, or, inArray, ne, sql } from "drizzle-orm";
import { resolveOfficer, hasFullAccess } from "../lib/auth";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../lib/objectStorage";
import {
  parsePrivateObjectDir,
  evidenceObjectName,
  evidenceCaseListPrefix,
  evidenceObjectPath,
} from "@workspace/object-storage";

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), "uploads");

const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /image\/(jpeg|png|gif|webp)|video\/(mp4|webm|mov|avi|mkv)/;
    cb(null, allowed.test(file.mimetype));
  },
});

type Officer = typeof officersTable.$inferSelect;

// Strictly parses a case id from a route param. Returns null unless the raw
// value is a positive integer that round-trips to the same string (so "12abc"
// and "abc" are rejected instead of silently becoming 12 or NaN).
function parseCaseIdParam(raw: string): number | null {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0 || String(id) !== raw) return null;
  return id;
}

// A non-leadership officer may only access cases where they are the lead agent
// or listed among the case agents. Leadership sees everything.
async function canAccessCase(officer: Officer, caseId: number, leadAgent: string): Promise<boolean> {
  if (hasFullAccess(officer.role)) return true;
  if (leadAgent === officer.name) return true;
  const [row] = await db
    .select({ id: caseAgentsTable.id })
    .from(caseAgentsTable)
    .where(and(eq(caseAgentsTable.caseId, caseId), eq(caseAgentsTable.name, officer.name)));
  return !!row;
}

// Loads the case and enforces involvement. Sends the appropriate error response
// and returns null when access is denied or the case doesn't exist.
async function loadAccessibleCase(
  req: Parameters<typeof resolveOfficer>[0],
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  id: number,
): Promise<{ officer: Officer; case: typeof casesTable.$inferSelect } | null> {
  const officer = await resolveOfficer(req);
  if (!officer) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return null;
  }
  const [c] = await db.select().from(casesTable).where(eq(casesTable.id, id));
  if (!c) {
    res.status(404).json({ error: "Fall nicht gefunden" });
    return null;
  }
  if (!(await canAccessCase(officer, c.id, c.leadAgent))) {
    res.status(403).json({ error: "Kein Zugriff auf diesen Fall" });
    return null;
  }
  return { officer, case: c };
}

const router = Router();

router.get("/", async (req, res) => {
  const officer = await resolveOfficer(req);
  if (!officer) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }

  const { status, priority, category, search, caseNumber, suspectName, vehiclePlate, missionNumber, dateFrom, dateTo } = req.query;

  const conditions = [];

  if (!hasFullAccess(officer.role)) {
    conditions.push(
      or(
        eq(casesTable.leadAgent, officer.name),
        inArray(
          casesTable.id,
          db.select({ caseId: caseAgentsTable.caseId }).from(caseAgentsTable).where(eq(caseAgentsTable.name, officer.name)),
        ),
      ),
    );
  }

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
    details: c.details ?? null,
    closedAt: c.closedAt?.toISOString() ?? null,
  })));
});

router.post("/", async (req, res) => {
  const officer = await resolveOfficer(req);
  if (!officer) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }

  const { title, category, priority, status, leadAgent, description, details, verhandlungsfuehrung, straftaten, tatDatum, tatWann, tatWo, tatWer } = req.body;

  if (straftaten !== undefined && straftaten !== null && (!Array.isArray(straftaten) || straftaten.some((s: unknown) => typeof s !== "string"))) {
    res.status(400).json({ error: "straftaten muss eine Liste von Zeichenketten sein" });
    return;
  }

  // Fallnummer: entweder vom Nutzer eingegeben (muss eindeutig sein) oder
  // automatisch generiert: SID-JJJJ/MM/TT - Wer - Agenten-ID - laufende Nr.
  // Die laufende Nummer kommt aus einer DB-Sequenz und zählt auch nach dem
  // Löschen von Akten weiter.
  const customCaseNumber = typeof req.body.caseNumber === "string" ? req.body.caseNumber.trim() : "";
  let caseNumber: string;
  if (customCaseNumber) {
    const [existing] = await db
      .select({ id: casesTable.id })
      .from(casesTable)
      .where(eq(casesTable.caseNumber, customCaseNumber));
    if (existing) {
      res.status(400).json({ error: "Diese Fallnummer ist bereits vergeben" });
      return;
    }
    caseNumber = customCaseNumber;
  } else {
    const now = new Date();
    const datePart = `SID-${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
    const werPart = typeof tatWer === "string" && tatWer.trim() ? tatWer.trim() : "Unbekannt";
    const leadName = typeof leadAgent === "string" ? leadAgent.trim() : "";
    const [leadOfficer] = leadName
      ? await db.select({ id: officersTable.id }).from(officersTable).where(eq(officersTable.name, leadName))
      : [];
    const agentId = leadOfficer?.id ?? officer.id;
    const seqResult = await db.execute(sql`SELECT nextval('case_number_seq') AS n`);
    const seqNum = String((seqResult.rows[0] as { n: string | number }).n).padStart(2, "0");
    caseNumber = `${datePart} - ${werPart} - ${agentId} - ${seqNum}`;
  }

  const [newCase] = await db.insert(casesTable).values({
    caseNumber,
    title,
    category,
    priority: priority || "Mittel",
    status: status || "Offen",
    leadAgent,
    description,
    details: details ?? null,
    verhandlungsfuehrung: verhandlungsfuehrung ?? null,
    straftaten: straftaten ?? null,
    tatDatum: tatDatum ?? null,
    tatWann: tatWann ?? null,
    tatWo: tatWo ?? null,
    tatWer: tatWer ?? null,
  }).returning();

  await db.insert(caseAgentsTable).values({ caseId: newCase.id, name: leadAgent, role: "Leitender Agent" });
  // Always link the creator to the case so they can see their own case even
  // when they entered someone else as the lead agent.
  if (officer.name !== leadAgent) {
    await db.insert(caseAgentsTable).values({ caseId: newCase.id, name: officer.name, role: "Ersteller" });
  }
  await db.insert(caseStatusHistoryTable).values({ caseId: newCase.id, fromStatus: "Neu", toStatus: status || "Offen", changedBy: leadAgent });

  res.status(201).json({
    ...newCase,
    lastModified: newCase.updatedAt.toISOString().split("T")[0],
    createdAt: newCase.createdAt.toISOString().split("T")[0],
    description: newCase.description ?? null,
    details: newCase.details ?? null,
    closedAt: null,
  });
});

router.get("/:id", async (req, res) => {
  const id = parseCaseIdParam(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  const access = await loadAccessibleCase(req, res, id);
  if (!access) return;
  const c = access.case;

  const agents = await db.select().from(caseAgentsTable).where(eq(caseAgentsTable.caseId, id));
  const leadAgent = agents.find(a => a.role === "Leitender Agent");
  const supporting = agents.filter(a => a.role !== "Leitender Agent" && a.role !== "Supervisor" && a.role !== "Ersteller").map(a => a.name);
  const supervisor = agents.find(a => a.role === "Supervisor")?.name ?? null;

  res.json({
    ...c,
    lastModified: c.updatedAt.toISOString().split("T")[0],
    createdAt: c.createdAt.toISOString().split("T")[0],
    supportingAgents: supporting,
    supervisor,
    description: c.description ?? null,
    details: c.details ?? null,
    closedAt: c.closedAt?.toISOString() ?? null,
  });
});

router.patch("/:id", async (req, res) => {
  const id = parseCaseIdParam(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  const access = await loadAccessibleCase(req, res, id);
  if (!access) return;
  const existing = access.case;

  const { title, category, priority, status, leadAgent, description, details } = req.body;
  const updates: Partial<typeof casesTable.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (category !== undefined) updates.category = category;
  if (priority !== undefined) updates.priority = priority;
  if (status !== undefined) updates.status = status;
  if (leadAgent !== undefined) updates.leadAgent = leadAgent;
  if (description !== undefined) updates.description = description;
  if (details !== undefined) updates.details = details;

  const leadChanged = leadAgent !== undefined && leadAgent !== existing.leadAgent;
  if (leadChanged) {
    const name = typeof leadAgent === "string" ? leadAgent.trim() : "";
    if (!name) {
      res.status(400).json({ error: "Leitender Agent darf nicht leer sein" });
      return;
    }
    const [officerRow] = await db
      .select({ id: officersTable.id })
      .from(officersTable)
      .where(and(eq(officersTable.name, name), eq(officersTable.freigegeben, true)));
    if (!officerRow) {
      res.status(400).json({ error: "Leitender Agent muss ein freigegebener Officer sein" });
      return;
    }
    updates.leadAgent = name;
  }

  const updated = await db.transaction(async (tx) => {
    if (status && status !== existing.status) {
      await tx.insert(caseStatusHistoryTable).values({
        caseId: id,
        fromStatus: existing.status,
        toStatus: status,
        changedBy: updates.leadAgent ?? existing.leadAgent,
      });
    }

    const [updatedCase] = await tx.update(casesTable).set(updates).where(eq(casesTable.id, id)).returning();

    if (leadChanged) {
      // Keep the case_agents lead row in sync so involvement-based visibility
      // and the Agenten tab reflect the new lead agent. The new lead's existing
      // support/supervisor row (if any) is removed to avoid duplicates; the
      // previous lead stays involved via a support role instead of losing access.
      await tx
        .delete(caseAgentsTable)
        .where(and(
          eq(caseAgentsTable.caseId, id),
          eq(caseAgentsTable.name, updatedCase.leadAgent),
          ne(caseAgentsTable.role, "Leitender Agent"),
        ));
      const renamed = await tx
        .update(caseAgentsTable)
        .set({ name: updatedCase.leadAgent })
        .where(and(eq(caseAgentsTable.caseId, id), eq(caseAgentsTable.role, "Leitender Agent")))
        .returning({ id: caseAgentsTable.id });
      if (renamed.length === 0) {
        await tx.insert(caseAgentsTable).values({ caseId: id, name: updatedCase.leadAgent, role: "Leitender Agent" });
      }
      const [prevLeadRow] = await tx
        .select({ id: caseAgentsTable.id })
        .from(caseAgentsTable)
        .where(and(eq(caseAgentsTable.caseId, id), eq(caseAgentsTable.name, existing.leadAgent)));
      if (!prevLeadRow && existing.leadAgent) {
        await tx.insert(caseAgentsTable).values({ caseId: id, name: existing.leadAgent, role: "Unterstützender Agent" });
      }
    }
    return updatedCase;
  });
  res.json({
    ...updated,
    lastModified: updated.updatedAt.toISOString().split("T")[0],
    createdAt: updated.createdAt.toISOString().split("T")[0],
    description: updated.description ?? null,
    details: updated.details ?? null,
    closedAt: updated.closedAt?.toISOString() ?? null,
  });
});

router.delete("/:id", async (req, res) => {
  const id = parseCaseIdParam(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }

  // Don't report a successful deletion for a case that never existed — otherwise
  // the client removes a row that was never there and the failure goes unnoticed.
  const access = await loadAccessibleCase(req, res, id);
  if (!access) return;

  // Delete associated evidence files from object storage before removing the case,
  // so we don't leave orphaned GCS objects under the case-<id>/ prefix.
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (privateObjectDir) {
    const { bucketName, gcsPrefix } = parsePrivateObjectDir(privateObjectDir);
    const bucket = objectStorageClient.bucket(bucketName);
    const gcsListPrefix = evidenceCaseListPrefix(gcsPrefix, id);
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
  const id = parseCaseIdParam(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  const access = await loadAccessibleCase(req, res, id);
  if (!access) return;
  const history = await db.select().from(caseStatusHistoryTable)
    .where(eq(caseStatusHistoryTable.caseId, id))
    .orderBy(desc(caseStatusHistoryTable.timestamp));
  res.json(history.map(h => ({ ...h, timestamp: h.timestamp.toISOString() })));
});

router.get("/:id/persons", async (req, res) => {
  const id = parseCaseIdParam(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  const access = await loadAccessibleCase(req, res, id);
  if (!access) return;
  const persons = await db.select().from(casePersonsTable).where(eq(casePersonsTable.caseId, id));
  res.json(persons.map(p => ({ ...p, formerIds: p.formerIds ?? null, lastLocation: p.lastLocation ?? null })));
});

router.get("/:id/agents", async (req, res) => {
  const id = parseCaseIdParam(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  const access = await loadAccessibleCase(req, res, id);
  if (!access) return;
  const agents = await db.select().from(caseAgentsTable).where(eq(caseAgentsTable.caseId, id));
  res.json(agents);
});

const ADDABLE_AGENT_ROLES = ["Unterstützender Agent", "Supervisor"];

// Only the lead agent of a case or full-access roles may change the case
// membership; mere involvement (support agents) is read-only here.
function canManageCaseAgents(access: { officer: Officer; case: typeof casesTable.$inferSelect }): boolean {
  return hasFullAccess(access.officer.role) || access.case.leadAgent === access.officer.name;
}

router.post("/:id/agents", async (req, res) => {
  const id = parseCaseIdParam(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  const access = await loadAccessibleCase(req, res, id);
  if (!access) return;
  if (!canManageCaseAgents(access)) {
    res.status(403).json({ error: "Nur der leitende Agent oder die Leitung darf Agenten verwalten" });
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const role = req.body?.role === undefined ? "Unterstützender Agent" : String(req.body.role);

  if (!name) {
    res.status(400).json({ error: "Name ist erforderlich" });
    return;
  }
  if (!ADDABLE_AGENT_ROLES.includes(role)) {
    res.status(400).json({ error: `Ungültige Rolle. Erlaubt: ${ADDABLE_AGENT_ROLES.join(", ")}` });
    return;
  }

  // The visibility check matches by exact officer name, so only registered
  // (approved) officers may be added — otherwise the entry is useless.
  const [officerRow] = await db
    .select({ id: officersTable.id })
    .from(officersTable)
    .where(and(eq(officersTable.name, name), eq(officersTable.freigegeben, true)));
  if (!officerRow) {
    res.status(400).json({ error: "Kein freigegebener Officer mit diesem Namen" });
    return;
  }

  if (access.case.leadAgent === name) {
    res.status(400).json({ error: "Dieser Officer ist bereits leitender Agent" });
    return;
  }
  const existing = await db
    .select({ id: caseAgentsTable.id, role: caseAgentsTable.role })
    .from(caseAgentsTable)
    .where(and(eq(caseAgentsTable.caseId, id), eq(caseAgentsTable.name, name)));
  if (existing.some(a => a.role !== "Ersteller")) {
    res.status(400).json({ error: "Dieser Officer ist dem Fall bereits zugewiesen" });
    return;
  }

  const [created] = await db.insert(caseAgentsTable).values({ caseId: id, name, role }).returning();
  res.status(201).json(created);
});

router.delete("/:id/agents/:agentId", async (req, res) => {
  const id = parseCaseIdParam(req.params.id);
  const agentId = parseCaseIdParam(req.params.agentId);
  if (id === null || agentId === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  const access = await loadAccessibleCase(req, res, id);
  if (!access) return;
  if (!canManageCaseAgents(access)) {
    res.status(403).json({ error: "Nur der leitende Agent oder die Leitung darf Agenten verwalten" });
    return;
  }

  const [agent] = await db
    .select()
    .from(caseAgentsTable)
    .where(and(eq(caseAgentsTable.id, agentId), eq(caseAgentsTable.caseId, id)));
  if (!agent) {
    res.status(404).json({ error: "Agent nicht gefunden" });
    return;
  }
  if (agent.role === "Leitender Agent") {
    res.status(400).json({ error: "Der leitende Agent kann nicht entfernt werden" });
    return;
  }

  await db.delete(caseAgentsTable).where(eq(caseAgentsTable.id, agentId));
  res.status(204).end();
});

router.post("/:id/evidence/upload", upload.array("files", 20), async (req, res) => {
  const caseId = parseCaseIdParam(String(req.params.id));
  if (caseId === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }

  const access = await loadAccessibleCase(req, res, caseId);
  if (!access) return;

  const files = (req.files as Express.Multer.File[]) ?? [];
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;

  if (!privateObjectDir) {
    req.log.error("PRIVATE_OBJECT_DIR not set — cannot upload to object storage");
    res.status(500).json({ error: "Object storage nicht konfiguriert" });
    return;
  }

  const { bucketName, gcsPrefix } = parsePrivateObjectDir(privateObjectDir);
  const bucket = objectStorageClient.bucket(bucketName);
  const uploadedBy = access.officer.name;

  const results = await Promise.all(files.map(async (f) => {
    const ext = path.extname(f.originalname);
    const unique = `${Date.now()}-${randomUUID()}${ext}`;
    // Object name in GCS: <gcsPrefix>/case-<id>/<unique>  (e.g. ".private/case-1/uuid.jpg")
    // entityId passed to getObjectEntityFile: case-<id>/<unique>  (prefix is stripped by the service)
    const objectName = evidenceObjectName(gcsPrefix, caseId, unique);
    const gcsFile = bucket.file(objectName);
    await gcsFile.save(f.buffer, { contentType: f.mimetype, resumable: false });
    // objectPath = /objects/<entityId> where entityId is relative to PRIVATE_OBJECT_DIR
    const objectPath = evidenceObjectPath(caseId, unique);

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
  const { filename } = req.params;
  const id = parseCaseIdParam(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }

  const access = await loadAccessibleCase(req, res, id);
  if (!access) return;

  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;

  if (!privateObjectDir) {
    res.status(500).json({ error: "Object storage nicht konfiguriert" });
    return;
  }

  const { bucketName, gcsPrefix } = parsePrivateObjectDir(privateObjectDir);
  const bucket = objectStorageClient.bucket(bucketName);
  const objectName = evidenceObjectName(gcsPrefix, id, filename);

  try {
    await bucket.file(objectName).delete();
  } catch (err) {
    req.log.warn({ err }, "Failed to delete GCS evidence file");
    res.status(404).json({ error: "Datei nicht gefunden" });
    return;
  }

  // Remove the DB metadata row so the file no longer shows up in listings.
  const objectPath = evidenceObjectPath(id, filename);
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
  const caseId = parseCaseIdParam(req.params.id);
  if (caseId === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }

  const access = await loadAccessibleCase(req, res, caseId);
  if (!access) return;

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
    .where(eq(evidenceFilesTable.caseId, caseId))
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
