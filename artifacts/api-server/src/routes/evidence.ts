import { Router } from "express";
import { db, evidenceTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { caseId } = req.query;
  let evidence = await db.select().from(evidenceTable).orderBy(desc(evidenceTable.addedAt));
  if (caseId) evidence = evidence.filter(e => e.caseId === parseInt(caseId as string));
  res.json(evidence.map(e => ({
    ...e,
    addedAt: e.addedAt.toISOString(),
    description: e.description ?? null,
  })));
});

router.post("/", async (req, res) => {
  const { title, type, description, caseId } = req.body;
  const [e] = await db.insert(evidenceTable).values({
    title,
    type,
    description,
    caseId,
    caseNumber: `SID-2026-${String(caseId).padStart(4, "0")}`,
    addedBy: "SA System",
  }).returning();
  res.status(201).json({ ...e, addedAt: e.addedAt.toISOString(), description: e.description ?? null });
});

export default router;
