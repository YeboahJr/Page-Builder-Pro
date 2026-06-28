import { Router } from "express";
import { db, officersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const BOOL_FIELDS = [
  "einweisung", "waffenfreigabeLMG", "waffenfreigabeHeavySniper",
  "freigabeCCU", "freigabeZivil", "freigabeUndercover",
  "meldeamtSAHP", "meldeamtPD", "meldeamtLI", "idChange",
] as const;

const TEXT_FIELDS = ["deckname", "telNr", "beitritt"] as const;

type Patchable = Partial<Pick<typeof officersTable.$inferSelect,
  "deckname" | "telNr" | "beitritt" |
  "einweisung" | "waffenfreigabeLMG" | "waffenfreigabeHeavySniper" |
  "freigabeCCU" | "freigabeZivil" | "freigabeUndercover" |
  "meldeamtSAHP" | "meldeamtPD" | "meldeamtLI" | "idChange"
>>;

const stripHash = (o: typeof officersTable.$inferSelect) => {
  const { passwortHash: _, ...data } = o;
  return data;
};

router.get("/", async (req, res) => {
  const officers = await db.select().from(officersTable);
  res.json(officers.map(stripHash));
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [officer] = await db.select().from(officersTable).where(eq(officersTable.id, id));
  if (!officer) return res.status(404).json({ error: "Officer nicht gefunden" });
  res.json(stripHash(officer));
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const body = req.body as Record<string, unknown>;
  const update: Patchable = {};

  for (const f of TEXT_FIELDS) {
    if (f in body) {
      const v = body[f];
      (update as Record<string, unknown>)[f] = v === null ? null : String(v);
    }
  }
  for (const f of BOOL_FIELDS) {
    if (f in body) (update as Record<string, unknown>)[f] = Boolean(body[f]);
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: "Keine änderbaren Felder angegeben" });
  }

  const [updated] = await db
    .update(officersTable)
    .set(update)
    .where(eq(officersTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Officer nicht gefunden" });
  res.json(stripHash(updated));
});

export default router;
