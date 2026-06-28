import { Router } from "express";
import { db, casesTable, reportsTable, evidenceTable } from "@workspace/db";
import { eq, count, desc } from "drizzle-orm";

const router = Router();

router.get("/stats", async (req, res) => {
  const allCases = await db.select().from(casesTable);
  const aktiveFaelle = allCases.filter(c => c.status === "Aktiv").length;
  const offeneFaelle = allCases.filter(c => c.status === "Offen").length;
  const abgeschlosseneFaelle = allCases.filter(c => c.status === "Abgeschlossen").length;
  const observationen = allCases.filter(c => c.status === "Observation").length;
  const hohePrioritaet = allCases.filter(c => c.priority === "Hoch").length;

  const allEvidence = await db.select().from(evidenceTable);
  const neueBeweismittel = allEvidence.length;

  res.json({
    aktiveFaelle,
    aktiveFaelleDelta: 4,
    offeneFaelle,
    offeneFaelleDelta: 2,
    abgeschlosseneFaelle,
    abgeschlosseneFaelleDelta: 7,
    observationen,
    observationenDelta: 3,
    neueBeweismittel,
    neueBeweismittelDelta: 2,
    hohePrioritaet,
    hohePrioritaetDelta: 1,
  });
});

router.get("/recent-activity", async (req, res) => {
  const cases = await db.select().from(casesTable).orderBy(desc(casesTable.updatedAt)).limit(10);
  const activity = cases.map((c, i) => ({
    id: i + 1,
    timestamp: c.updatedAt.toISOString(),
    action: `Status geändert zu ${c.status}`,
    agent: c.leadAgent,
    caseId: c.id,
    caseNumber: c.caseNumber,
  }));
  res.json(activity);
});

export default router;
