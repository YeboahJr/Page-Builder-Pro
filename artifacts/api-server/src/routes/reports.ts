import { Router } from "express";
import { db, reportsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { priority, status, type } = req.query;
  let reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.reportedAt));
  if (priority) reports = reports.filter(r => r.priority === priority);
  if (status) reports = reports.filter(r => r.status === status);
  if (type) reports = reports.filter(r => r.type === type);
  res.json(reports.map(r => ({
    ...r,
    reportedAt: r.reportedAt.toISOString(),
    description: r.description ?? null,
  })));
});

router.post("/", async (req, res) => {
  const { type, title, location, description, priority } = req.body;
  const [report] = await db.insert(reportsTable).values({
    type,
    title,
    location,
    description,
    priority: priority || "Mittel",
    status: "In Bearbeitung",
    units: 1,
  }).returning();
  res.status(201).json({ ...report, reportedAt: report.reportedAt.toISOString(), description: report.description ?? null });
});

router.get("/stats", async (req, res) => {
  const all = await db.select().from(reportsTable);
  const aktiveNotfaelle = all.filter(r => r.priority === "Kritisch" && r.status !== "Abgeschlossen").length;
  const geiselnahmen = all.filter(r => r.type === "GEISELNAHME" && r.status !== "Abgeschlossen").length;
  const hohePrioritaet = all.filter(r => r.priority === "Hoch" && r.status !== "Abgeschlossen").length;
  const offeneMeldungen = all.filter(r => r.status !== "Abgeschlossen").length;
  const abgeschlossene = all.filter(r => r.status === "Abgeschlossen").length;

  res.json({
    aktiveNotfaelle,
    aktiveNotfaelleDelta: "+1 seit letzter Stunde",
    geiselnahmen,
    geiselnahmenStatus: "Aktuell aktiv",
    hohePrioritaet,
    hohePrioritaetDelta: "+2 seit letzter Stunde",
    offeneMeldungen,
    offeneMeldungenDelta: "-3 seit letzter Stunde",
    abgeschlossene,
    abgeschlosseneDelta: "+5 seit letzter Stunde",
    leitstelleStatus: "Online",
    funkverbindung: "Stabil",
    cadSystem: "Online",
    letzteAktualisierung: new Date().toISOString(),
  });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
  if (!report) return res.status(404).json({ error: "Meldung nicht gefunden" });
  res.json({ ...report, reportedAt: report.reportedAt.toISOString(), description: report.description ?? null });
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, units, description } = req.body;
  const updates: Partial<typeof reportsTable.$inferInsert> = {};
  if (status !== undefined) updates.status = status;
  if (units !== undefined) updates.units = units;
  if (description !== undefined) updates.description = description;
  const [updated] = await db.update(reportsTable).set(updates).where(eq(reportsTable.id, id)).returning();
  res.json({ ...updated, reportedAt: updated.reportedAt.toISOString(), description: updated.description ?? null });
});

export default router;
