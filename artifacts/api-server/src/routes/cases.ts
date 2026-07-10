import { Router } from "express";
import { db, casesTable, casePersonsTable, caseAgentsTable, caseStatusHistoryTable, evidenceFilesTable, officersTable } from "@workspace/db";
import { eq, ilike, and, gte, lte, desc, or, inArray, ne, sql } from "drizzle-orm";
import { resolveOfficer, hasFullAccess } from "../lib/auth";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../lib/objectStorage";
import { buildAktePdf } from "../lib/aktePdf";
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

// Status, mit dem eine Akte an die Staatsanwaltschaft übergeben wird — muss
// mit STA_STATUS im Frontend (staatsanwaltschaft.tsx) übereinstimmen.
const STA_STATUS = "An STA übergeben";

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

type CaseAccess = {
  officer: Officer;
  case: typeof casesTable.$inferSelect;
  // True when access was granted solely because the officer has the STA role
  // and the case was handed to the Staatsanwaltschaft — read-only access.
  staReadOnly: boolean;
};

// Loads the case and enforces involvement. Officers with the STA role
// additionally get read-only access to every case that was handed to the
// Staatsanwaltschaft. Sends the appropriate error response and returns null
// when access is denied or the case doesn't exist.
async function loadAccessibleCase(
  req: Parameters<typeof resolveOfficer>[0],
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  id: number,
): Promise<CaseAccess | null> {
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
  const involved = await canAccessCase(officer, c.id, c.leadAgent);
  const staReadOnly = !involved && officer.role === "STA" && c.status === STA_STATUS;
  if (!involved && !staReadOnly) {
    res.status(403).json({ error: "Kein Zugriff auf diesen Fall" });
    return null;
  }
  return { officer, case: c, staReadOnly };
}

// Guard for mutating endpoints: STA officers whose access is based only on the
// handover status may read the case but never modify it.
function rejectStaReadOnly(
  access: CaseAccess,
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
): boolean {
  if (access.staReadOnly) {
    res.status(403).json({ error: "Die Staatsanwaltschaft hat nur Lesezugriff auf diesen Fall" });
    return true;
  }
  return false;
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
    const visibility = [
      eq(casesTable.leadAgent, officer.name),
      inArray(
        casesTable.id,
        db.select({ caseId: caseAgentsTable.caseId }).from(caseAgentsTable).where(eq(caseAgentsTable.name, officer.name)),
      ),
    ];
    // STA-Offiziere sehen zusätzlich alle an die Staatsanwaltschaft
    // übergebenen Akten, auch ohne eigene Beteiligung.
    if (officer.role === "STA") {
      visibility.push(eq(casesTable.status, STA_STATUS));
    }
    conditions.push(or(...visibility));
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

  const { title, category, priority, status, leadAgent, description, details, verhandlungsfuehrung, straftaten, tatDatum, tatWann, tatWo, tatWer, geiseln, forderungen } = req.body;

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
    geiseln: geiseln ?? null,
    forderungen: forderungen ?? null,
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
  if (rejectStaReadOnly(access, res)) return;
  const existing = access.case;

  const { title, category, priority, status, leadAgent, description, details, verhandlungsfuehrung, straftaten, tatDatum, tatWann, tatWo, tatWer, geiseln, forderungen } = req.body;

  if (straftaten !== undefined && straftaten !== null && (!Array.isArray(straftaten) || straftaten.some((s: unknown) => typeof s !== "string"))) {
    res.status(400).json({ error: "straftaten muss eine Liste von Zeichenketten sein" });
    return;
  }

  const updates: Partial<typeof casesTable.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (category !== undefined) updates.category = category;
  if (priority !== undefined) updates.priority = priority;
  if (status !== undefined) updates.status = status;
  if (leadAgent !== undefined) updates.leadAgent = leadAgent;
  if (description !== undefined) updates.description = description;
  if (details !== undefined) updates.details = details;
  if (verhandlungsfuehrung !== undefined) updates.verhandlungsfuehrung = verhandlungsfuehrung;
  if (straftaten !== undefined) updates.straftaten = straftaten;
  if (tatDatum !== undefined) updates.tatDatum = tatDatum;
  if (tatWann !== undefined) updates.tatWann = tatWann;
  if (tatWo !== undefined) updates.tatWo = tatWo;
  if (tatWer !== undefined) updates.tatWer = tatWer;
  if (geiseln !== undefined) updates.geiseln = geiseln;
  if (forderungen !== undefined) updates.forderungen = forderungen;

  // Fallnummer: nur ändern, wenn eine neue, nicht-leere Nummer angegeben wurde.
  const newCaseNumber = typeof req.body.caseNumber === "string" ? req.body.caseNumber.trim() : "";
  if (newCaseNumber && newCaseNumber !== existing.caseNumber) {
    const [taken] = await db
      .select({ id: casesTable.id })
      .from(casesTable)
      .where(eq(casesTable.caseNumber, newCaseNumber));
    if (taken) {
      res.status(400).json({ error: "Diese Fallnummer ist bereits vergeben" });
      return;
    }
    updates.caseNumber = newCaseNumber;
  }

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
      .where(eq(officersTable.name, name));
    if (!officerRow) {
      res.status(400).json({ error: "Leitender Agent muss ein Officer aus der Personalliste sein" });
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
  if (rejectStaReadOnly(access, res)) return;

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

  // The visibility check matches by exact officer name, so only officers from
  // the Personal list may be added — otherwise the entry is useless.
  const [officerRow] = await db
    .select({ id: officersTable.id })
    .from(officersTable)
    .where(eq(officersTable.name, name));
  if (!officerRow) {
    res.status(400).json({ error: "Kein Officer mit diesem Namen in der Personalliste" });
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
  if (rejectStaReadOnly(access, res)) return;

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

  // Per-file descriptions, aligned by index with the uploaded files.
  const rawDescriptions = (req.body as Record<string, unknown> | undefined)?.descriptions;
  const descriptions: string[] = Array.isArray(rawDescriptions)
    ? rawDescriptions.map((d) => String(d))
    : rawDescriptions != null
      ? [String(rawDescriptions)]
      : [];

  const results = await Promise.all(files.map(async (f, idx) => {
    const ext = path.extname(f.originalname);
    const unique = `${Date.now()}-${randomUUID()}${ext}`;
    // Object name in GCS: <gcsPrefix>/case-<id>/<unique>  (e.g. ".private/case-1/uuid.jpg")
    // entityId passed to getObjectEntityFile: case-<id>/<unique>  (prefix is stripped by the service)
    const objectName = evidenceObjectName(gcsPrefix, caseId, unique);
    const gcsFile = bucket.file(objectName);
    await gcsFile.save(f.buffer, { contentType: f.mimetype, resumable: false });
    // objectPath = /objects/<entityId> where entityId is relative to PRIVATE_OBJECT_DIR
    const objectPath = evidenceObjectPath(caseId, unique);

    const description = descriptions[idx]?.trim() || null;

    const [row] = await db.insert(evidenceFilesTable).values({
      caseId,
      objectPath,
      originalName: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      description,
      uploadedBy,
    }).returning();

    return {
      name: f.originalname,
      filename: unique,
      mimetype: f.mimetype,
      size: f.size,
      url: `/api/storage${objectPath}`,
      objectPath,
      description: row.description,
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
  if (rejectStaReadOnly(access, res)) return;

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

// Update the description ("Bildbeschreibung") of an uploaded evidence file.
router.patch("/:id/evidence/:filename/description", async (req, res) => {
  const { filename } = req.params;
  const id = parseCaseIdParam(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }

  const access = await loadAccessibleCase(req, res, id);
  if (!access) return;
  if (rejectStaReadOnly(access, res)) return;

  const raw = (req.body as { description?: unknown } | undefined)?.description;
  if (typeof raw !== "string" || raw.length > 2000) {
    res.status(400).json({ error: "Ungültige Beschreibung" });
    return;
  }
  const description = raw.trim() || null;

  const objectPath = evidenceObjectPath(id, filename);
  const [row] = await db.update(evidenceFilesTable)
    .set({ description })
    .where(and(eq(evidenceFilesTable.caseId, id), eq(evidenceFilesTable.objectPath, objectPath)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Datei nicht gefunden" });
    return;
  }

  res.json({ filename, description: row.description });
});

// Renders the case file ("Akte") as a downloadable PDF modeled after the FIB
// paper template. Access follows the same involvement rules as the case itself.
router.get("/:id/akte", async (req, res) => {
  const caseId = parseCaseIdParam(req.params.id);
  if (caseId === null) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  const access = await loadAccessibleCase(req, res, caseId);
  if (!access) return;
  const c = access.case;

  const [leadOfficer] = await db
    .select({ dienstnummer: officersTable.dienstnummer, rank: officersTable.rank })
    .from(officersTable)
    .where(eq(officersTable.name, c.leadAgent));

  const agents = await db
    .select({ name: caseAgentsTable.name, role: caseAgentsTable.role })
    .from(caseAgentsTable)
    .where(eq(caseAgentsTable.caseId, caseId));

  // Collect embeddable evidence images (PDFKit supports JPEG + PNG only).
  // Caps keep the in-memory footprint bounded for cases with many/large files;
  // anything beyond the caps is listed by name instead of embedded.
  const MAX_EMBEDDED_IMAGES = 20;
  const MAX_EMBEDDED_BYTES = 60 * 1024 * 1024;
  let embeddedBytes = 0;
  const images: Array<{ filename: string; description: string | null; data: Buffer }> = [];
  const otherFiles: string[] = [];
  const embeddable = new Set([".jpg", ".jpeg", ".png"]);

  const rows = await db.select().from(evidenceFilesTable)
    .where(eq(evidenceFilesTable.caseId, caseId))
    .orderBy(desc(evidenceFilesTable.uploadedAt));

  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  for (const r of rows) {
    const filename = r.objectPath.slice(r.objectPath.lastIndexOf("/") + 1);
    const ext = path.extname(r.originalName || filename).toLowerCase();
    const withinCaps = images.length < MAX_EMBEDDED_IMAGES
      && embeddedBytes + r.size <= MAX_EMBEDDED_BYTES;
    if (embeddable.has(ext) && privateObjectDir && withinCaps) {
      try {
        const { bucketName, gcsPrefix } = parsePrivateObjectDir(privateObjectDir);
        const objectName = evidenceObjectName(gcsPrefix, caseId, filename);
        const [buf] = await objectStorageClient.bucket(bucketName).file(objectName).download();
        embeddedBytes += buf.length;
        images.push({ filename: r.originalName || filename, description: r.description?.trim() || null, data: buf });
      } catch (err) {
        req.log.warn({ err, filename }, "Akte-PDF: Beweisbild konnte nicht geladen werden");
        otherFiles.push(r.originalName || filename);
      }
    } else {
      otherFiles.push(r.originalName || filename);
    }
  }

  // Local fallback files (backward compatibility with pre-GCS uploads).
  const localDir = path.join(LOCAL_UPLOADS_DIR, `case-${caseId}`);
  if (fs.existsSync(localDir)) {
    for (const name of fs.readdirSync(localDir)) {
      const ext = path.extname(name).toLowerCase();
      if (embeddable.has(ext) && images.length < MAX_EMBEDDED_IMAGES && embeddedBytes < MAX_EMBEDDED_BYTES) {
        try {
          const filePath = path.join(localDir, name);
          const size = fs.statSync(filePath).size;
          if (embeddedBytes + size > MAX_EMBEDDED_BYTES) {
            otherFiles.push(name);
            continue;
          }
          const buf = fs.readFileSync(filePath);
          embeddedBytes += buf.length;
          images.push({ filename: name, description: null, data: buf });
        } catch {
          otherFiles.push(name);
        }
      } else {
        otherFiles.push(name);
      }
    }
  }

  const safeNumber = c.caseNumber.replace(/[^A-Za-z0-9._-]+/g, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Akte_${safeNumber}.pdf"`);

  const doc = buildAktePdf({
    caseNumber: c.caseNumber,
    title: c.title,
    category: c.category,
    priority: c.priority,
    status: c.status,
    leadAgent: c.leadAgent,
    leadAgentDienstnummer: leadOfficer?.dienstnummer ?? null,
    leadAgentRank: leadOfficer?.rank ?? null,
    description: c.description,
    details: c.details,
    verhandlungsfuehrung: c.verhandlungsfuehrung,
    straftaten: c.straftaten,
    tatDatum: c.tatDatum,
    tatWann: c.tatWann,
    tatWo: c.tatWo,
    tatWer: c.tatWer,
    createdAt: c.createdAt,
    agents,
    images,
    otherFiles,
  });
  doc.pipe(res);
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

  type FileEntry = { filename: string; url: string; objectPath: string; type: string; size: number; uploadedAt: string; uploadedBy: string | null; description: string | null };

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
      description: r.description,
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
        description: null,
      });
    }
  }

  res.json({ files: [...dbFiles, ...localFiles] });
});

export default router;
