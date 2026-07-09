import { Router } from "express";
import { db, evidenceTable, casesTable } from "@workspace/db";
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
  const [parentCase] = await db.select({ caseNumber: casesTable.caseNumber }).from(casesTable).where(eq(casesTable.id, caseId));
  if (!parentCase) {
    res.status(400).json({ error: "Fall nicht gefunden" });
    return;
  }
  const [e] = await db.insert(evidenceTable).values({
    title,
    type,
    description,
    caseId,
    caseNumber: parentCase.caseNumber,
    addedBy: "SA System",
  }).returning();
  res.status(201).json({ ...e, addedAt: e.addedAt.toISOString(), description: e.description ?? null });
});

export default router;
