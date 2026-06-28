import { Router } from "express";
import { db, patrolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const patrols = await db.select().from(patrolsTable);
  res.json(patrols.map(p => ({
    ...p,
    slots: p.slots as unknown[],
  })));
});

router.post("/", async (req, res) => {
  const { name } = req.body;
  const defaultSlots = [
    { position: "01", officerId: null, officerName: null, notes: null },
    { position: "02", officerId: null, officerName: null, notes: null },
    { position: "03", officerId: null, officerName: null, notes: null },
    { position: "04", officerId: null, officerName: null, notes: null },
  ];
  const [patrol] = await db.insert(patrolsTable).values({ name, slots: defaultSlots }).returning();
  res.status(201).json({ ...patrol, slots: patrol.slots as unknown[] });
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Ungültige ID" });
  }
  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if ("patrolType" in body) update.patrolType = String(body.patrolType);
  if ("status" in body) update.status = String(body.status);
  if ("vehicle" in body) update.vehicle = body.vehicle == null ? null : String(body.vehicle);
  if ("notes" in body) update.notes = body.notes == null ? null : String(body.notes);
  if ("slots" in body) update.slots = body.slots;
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: "Keine Änderungen übermittelt" });
  }
  const [updated] = await db.update(patrolsTable).set(update).where(eq(patrolsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Streife nicht gefunden" });
  return res.json({ ...updated, slots: updated.slots as unknown[] });
});

export default router;
