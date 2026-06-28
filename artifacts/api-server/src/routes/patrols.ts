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
    { position: "01", officerId: null, officerName: null, patrolType: "Regelstreife", status: "Frei auf Streife", vehicle: null, notes: null },
    { position: "02", officerId: null, officerName: null, patrolType: "Regelstreife", status: "Frei auf Streife", vehicle: null, notes: null },
    { position: "03", officerId: null, officerName: null, patrolType: "Regelstreife", status: "Frei auf Streife", vehicle: null, notes: null },
    { position: "04", officerId: null, officerName: null, patrolType: "Regelstreife", status: "Frei auf Streife", vehicle: null, notes: null },
  ];
  const [patrol] = await db.insert(patrolsTable).values({ name, slots: defaultSlots }).returning();
  res.status(201).json({ ...patrol, slots: patrol.slots as unknown[] });
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { slots } = req.body;
  const [updated] = await db.update(patrolsTable).set({ slots }).where(eq(patrolsTable.id, id)).returning();
  res.json({ ...updated, slots: updated.slots as unknown[] });
});

export default router;
