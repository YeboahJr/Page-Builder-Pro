import { Router } from "express";
import { db, razziaAntraegeTable, casesTable, officersTable } from "@workspace/db";
import { eq, inArray, desc } from "drizzle-orm";
import { resolveOfficer } from "../lib/auth";
import { uploadAkteAsset } from "../lib/objectStorage";
import { createRazziaDoc } from "../lib/akteDoc";
import { renderStampImage } from "../lib/stampImage";
import fibEmblemGray from "../assets/fib-emblem-gray.png";

// Razzia-Anträge ("Antrag auf Durchsuchungsbefehl"): ausschließlich für
// Direktion/Leitung (und Admin) — Rollen-Gating erfolgt in routes/index.ts
// über requireLeadership. Angehängt werden nur abgeschlossene Akten.
const router = Router();

// Eingabe-Validierung (target + caseIds) mit deutschen Fehlermeldungen.
function parseInput(body: unknown): { target: string; caseIds: number[] } | { error: string } {
  const b = body as { target?: unknown; caseIds?: unknown };
  const target = typeof b?.target === "string" ? b.target.trim() : "";
  if (!target) return { error: "Gegen wen der Antrag geht, muss angegeben werden" };
  if (!Array.isArray(b.caseIds) || b.caseIds.length === 0) {
    return { error: "Mindestens eine abgeschlossene Akte auswählen" };
  }
  const caseIds: number[] = [];
  for (const v of b.caseIds) {
    if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) return { error: "Ungültige Akten-Auswahl" };
    caseIds.push(v);
  }
  return { target, caseIds };
}

type AntragRow = typeof razziaAntraegeTable.$inferSelect;

// Serialisiert einen Antrag inkl. Kurzinfo der verknüpften Akten
// (in der gespeicherten Auswahlreihenfolge).
async function serialize(rows: AntragRow[]) {
  const allIds = [...new Set(rows.flatMap((r) => r.caseIds))];
  const caseRows = allIds.length
    ? await db
        .select({
          id: casesTable.id,
          caseNumber: casesTable.caseNumber,
          title: casesTable.title,
          status: casesTable.status,
        })
        .from(casesTable)
        .where(inArray(casesTable.id, allIds))
    : [];
  const byId = new Map(caseRows.map((c) => [c.id, c]));
  return rows.map((r) => ({
    id: r.id,
    target: r.target,
    caseIds: r.caseIds,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    cases: r.caseIds.map((id) => byId.get(id)).filter((c) => c !== undefined),
  }));
}

// Prüft, dass alle angegebenen Akten existieren und abgeschlossen sind.
// Liefert im Fehlerfall eine deutsche Fehlermeldung.
async function validateCaseIds(caseIds: number[]): Promise<string | null> {
  const rows = await db
    .select({ id: casesTable.id, caseNumber: casesTable.caseNumber, status: casesTable.status })
    .from(casesTable)
    .where(inArray(casesTable.id, caseIds));
  const byId = new Map(rows.map((c) => [c.id, c]));
  for (const id of caseIds) {
    const c = byId.get(id);
    if (!c) return `Akte mit ID ${id} wurde nicht gefunden`;
    if (c.status !== "Abgeschlossen") return `Akte ${c.caseNumber} ist nicht abgeschlossen`;
  }
  return null;
}

router.get("/", async (_req, res) => {
  const rows = await db.select().from(razziaAntraegeTable).orderBy(desc(razziaAntraegeTable.createdAt));
  res.json(await serialize(rows));
});

router.post("/", async (req, res) => {
  const parsed = parseInput(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const caseIds = [...new Set(parsed.caseIds)];
  const invalid = await validateCaseIds(caseIds);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }
  const officer = await resolveOfficer(req);
  const [row] = await db
    .insert(razziaAntraegeTable)
    .values({ target: parsed.target, caseIds, createdBy: officer?.name ?? null })
    .returning();
  res.status(201).json((await serialize([row]))[0]);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  const parsed = parseInput(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const caseIds = [...new Set(parsed.caseIds)];
  const invalid = await validateCaseIds(caseIds);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }
  const [row] = await db
    .update(razziaAntraegeTable)
    .set({ target: parsed.target, caseIds })
    .where(eq(razziaAntraegeTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Razzia-Antrag nicht gefunden" });
    return;
  }
  res.json((await serialize([row]))[0]);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  const [row] = await db.delete(razziaAntraegeTable).where(eq(razziaAntraegeTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Razzia-Antrag nicht gefunden" });
    return;
  }
  res.status(204).end();
});

// Erzeugt den Antrag als Google-Docs-Dokument nach der Antrags-Vorlage
// (gleiche Kopf-/Fußzeile wie die Akte) und liefert die Links zurück.
router.get("/:id/dokument", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  const [antrag] = await db.select().from(razziaAntraegeTable).where(eq(razziaAntraegeTable.id, id));
  if (!antrag) {
    res.status(404).json({ error: "Razzia-Antrag nicht gefunden" });
    return;
  }

  const caseRows = antrag.caseIds.length
    ? await db
        .select({
          id: casesTable.id,
          caseNumber: casesTable.caseNumber,
          title: casesTable.title,
          straftaten: casesTable.straftaten,
        })
        .from(casesTable)
        .where(inArray(casesTable.id, antrag.caseIds))
    : [];
  const byId = new Map(caseRows.map((c) => [c.id, c]));
  const cases = antrag.caseIds
    .map((cid) => byId.get(cid))
    .filter((c) => c !== undefined)
    .map((c) => ({ caseNumber: c.caseNumber, title: c.title, straftaten: c.straftaten }));

  // Der Antrag wird auf den ausführenden Beamten ausgestellt (nicht zwingend
  // den ursprünglichen Ersteller) — dessen Stempel landet unter der Grußformel.
  const officer = await resolveOfficer(req);
  const createdBy = officer?.name ?? antrag.createdBy ?? "Federal Investigation Bureau";
  let dienstnummer: string | null = officer?.dienstnummer ?? null;
  let rank: string | null = officer?.rank ?? null;
  if (!officer && antrag.createdBy) {
    const [creator] = await db
      .select({ dienstnummer: officersTable.dienstnummer, rank: officersTable.rank })
      .from(officersTable)
      .where(eq(officersTable.name, antrag.createdBy));
    dienstnummer = creator?.dienstnummer ?? null;
    rank = creator?.rank ?? null;
  }

  let sealUrl: string | null = null;
  let stampUrl: string | null = null;
  try {
    sealUrl = await uploadAkteAsset(Buffer.from(fibEmblemGray, "base64"), "fib-seal.png");
  } catch (err) {
    req.log.warn({ err }, "Razzia-Antrag: Kopfzeilen-Siegel konnte nicht hochgeladen werden");
  }
  try {
    const stampPng = await renderStampImage({ name: createdBy, rang: rank });
    stampUrl = await uploadAkteAsset(stampPng, `stamp-razzia-${id}-${Date.now()}.png`);
  } catch (err) {
    req.log.warn({ err, id }, "Razzia-Antrag: Unterschriften-Stempel konnte nicht erzeugt werden");
  }

  try {
    const result = await createRazziaDoc({
      target: antrag.target,
      antragNumber: `RZ-${antrag.createdAt.getFullYear()}-${String(antrag.id).padStart(2, "0")}`,
      createdBy,
      createdByDienstnummer: dienstnummer,
      createdByRank: rank,
      createdAt: antrag.createdAt,
      cases,
      sealUrl,
      stampUrl,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err, id }, "Razzia-Antrag: Google-Docs-Dokument konnte nicht erstellt werden");
    res.status(502).json({ error: "Antrag konnte nicht als Google-Docs-Dokument erstellt werden. Bitte später erneut versuchen." });
  }
});

export default router;
