import { Router } from "express";
import { db, officersTable, sessionsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "fib_salt_2026").digest("hex");
}

const BOOL_FIELDS = [
  "einweisung", "waffenfreigabeLMG", "waffenfreigabeHeavySniper",
  "freigabeCCU", "freigabeZivil", "freigabeUndercover",
  "meldeamtSAHP", "meldeamtPD", "meldeamtLI", "idChange",
] as const;

const TEXT_FIELDS = ["deckname", "telNr", "abmeldungBis", "beitritt", "dienstnummer", "name", "rank"] as const;

type Patchable = Partial<Pick<typeof officersTable.$inferSelect,
  "deckname" | "telNr" | "abmeldungBis" | "beitritt" | "dienstnummer" | "name" | "rank" |
  "einweisung" | "waffenfreigabeLMG" | "waffenfreigabeHeavySniper" |
  "freigabeCCU" | "freigabeZivil" | "freigabeUndercover" |
  "meldeamtSAHP" | "meldeamtPD" | "meldeamtLI" | "idChange"
>>;

const stripHash = (o: typeof officersTable.$inferSelect) => {
  const { passwortHash: _, ...data } = o;
  return data;
};

router.get("/", async (req, res) => {
  const officers = await db.select().from(officersTable).orderBy(asc(officersTable.dienstnummer));
  res.json(officers.map(stripHash));
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [officer] = await db.select().from(officersTable).where(eq(officersTable.id, id));
  if (!officer) return res.status(404).json({ error: "Officer nicht gefunden" });
  return res.json(stripHash(officer));
});

router.post("/", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const dienstnummer = typeof body.dienstnummer === "string" ? body.dienstnummer.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rank = typeof body.rank === "string" ? body.rank.trim() : "";
  if (!dienstnummer || !name || !rank) {
    return res.status(400).json({ error: "Dienstnummer, Name und Rang sind erforderlich" });
  }

  const [existing] = await db.select().from(officersTable).where(eq(officersTable.dienstnummer, dienstnummer));
  if (existing) {
    return res.status(409).json({ error: "Dienstnummer bereits vergeben" });
  }

  const passwort = typeof body.passwort === "string" && body.passwort.length > 0 ? body.passwort : "1234";

  try {
    const [created] = await db.insert(officersTable).values({
      dienstnummer,
      name,
      rank,
      passwortHash: hashPassword(passwort),
      deckname: typeof body.deckname === "string" ? body.deckname : null,
      telNr: typeof body.telNr === "string" ? body.telNr : null,
      abmeldungBis: typeof body.abmeldungBis === "string" ? body.abmeldungBis : null,
      beitritt: typeof body.beitritt === "string" ? body.beitritt : null,
    }).returning();
    return res.status(201).json(stripHash(created));
  } catch {
    return res.status(500).json({ error: "Officer konnte nicht angelegt werden" });
  }
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const body = req.body as Record<string, unknown>;
  const update: Patchable = {};

  for (const f of TEXT_FIELDS) {
    if (f in body) {
      const v = body[f];
      if ((f === "dienstnummer" || f === "name" || f === "rank")) {
        if (typeof v !== "string" || v.trim() === "") {
          return res.status(400).json({ error: `${f} darf nicht leer sein` });
        }
        (update as Record<string, unknown>)[f] = v.trim();
      } else {
        (update as Record<string, unknown>)[f] = v === null ? null : String(v);
      }
    }
  }
  for (const f of BOOL_FIELDS) {
    if (f in body) (update as Record<string, unknown>)[f] = Boolean(body[f]);
  }

  let newId: number | undefined;
  if ("id" in body) {
    const parsed = typeof body.id === "number" ? body.id : parseInt(String(body.id), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return res.status(400).json({ error: "ID muss eine positive ganze Zahl sein" });
    }
    if (parsed !== id) newId = parsed;
  }

  if (Object.keys(update).length === 0 && newId === undefined) {
    return res.status(400).json({ error: "Keine änderbaren Felder angegeben" });
  }

  if (update.dienstnummer) {
    const [existing] = await db.select().from(officersTable).where(eq(officersTable.dienstnummer, update.dienstnummer));
    if (existing && existing.id !== id) {
      return res.status(409).json({ error: "Dienstnummer bereits vergeben" });
    }
  }

  if (newId !== undefined) {
    const [existing] = await db.select().from(officersTable).where(eq(officersTable.id, newId));
    if (existing) {
      return res.status(409).json({ error: "ID bereits vergeben" });
    }
    (update as Record<string, unknown>).id = newId;
  }

  let updated: typeof officersTable.$inferSelect | undefined;
  if (newId !== undefined) {
    updated = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(officersTable)
        .set(update)
        .where(eq(officersTable.id, id))
        .returning();
      if (!u) return undefined;
      await tx.update(sessionsTable).set({ officerId: newId }).where(eq(sessionsTable.officerId, id));
      return u;
    });
  } else {
    [updated] = await db
      .update(officersTable)
      .set(update)
      .where(eq(officersTable.id, id))
      .returning();
  }

  if (!updated) return res.status(404).json({ error: "Officer nicht gefunden" });
  return res.json(stripHash(updated));
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Ungültige ID" });
  }
  await db.delete(sessionsTable).where(eq(sessionsTable.officerId, id));
  const deleted = await db.delete(officersTable).where(eq(officersTable.id, id)).returning();
  if (deleted.length === 0) {
    return res.status(404).json({ error: "Officer nicht gefunden" });
  }
  return res.status(204).end();
});

export default router;
