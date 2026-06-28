import { Router } from "express";
import { db, casesTable, casePersonsTable, caseAgentsTable, caseStatusHistoryTable } from "@workspace/db";
import { eq, ilike, and, gte, lte, desc, or } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOADS_DIR, `case-${req.params.id}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /image\/(jpeg|png|gif|webp)|video\/(mp4|webm|mov|avi|mkv)/;
    cb(null, allowed.test(file.mimetype));
  },
});

const router = Router();

router.get("/", async (req, res) => {
  const { status, priority, category, search, caseNumber, suspectName, vehiclePlate, missionNumber, dateFrom, dateTo } = req.query;

  let query = db.select().from(casesTable);
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
  if (!c) return res.status(404).json({ error: "Fall nicht gefunden" });

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
  if (!existing) return res.status(404).json({ error: "Fall nicht gefunden" });

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
  await db.delete(casePersonsTable).where(eq(casePersonsTable.caseId, id));
  await db.delete(caseAgentsTable).where(eq(caseAgentsTable.caseId, id));
  await db.delete(caseStatusHistoryTable).where(eq(caseStatusHistoryTable.caseId, id));
  await db.delete(casesTable).where(eq(casesTable.id, id));
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

router.post("/:id/evidence/upload", upload.array("files", 20), (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  const results = files.map(f => ({
    name: f.originalname,
    filename: f.filename,
    mimetype: f.mimetype,
    size: f.size,
    url: `/api/uploads/case-${req.params.id}/${f.filename}`,
  }));
  res.json({ uploaded: results.length, files: results });
});

router.get("/:id/evidence/files", (req, res) => {
  const dir = path.join(UPLOADS_DIR, `case-${req.params.id}`);
  if (!fs.existsSync(dir)) return res.json({ files: [] });
  const imageExts = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
  const videoExts = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]);
  const files = fs.readdirSync(dir).map(name => {
    const ext = path.extname(name).toLowerCase();
    const stat = fs.statSync(path.join(dir, name));
    return {
      filename: name,
      url: `/api/uploads/case-${req.params.id}/${name}`,
      type: imageExts.has(ext) ? "image" : videoExts.has(ext) ? "video" : "other",
      size: stat.size,
      uploadedAt: stat.mtime.toISOString(),
    };
  });
  res.json({ files });
});

export default router;
