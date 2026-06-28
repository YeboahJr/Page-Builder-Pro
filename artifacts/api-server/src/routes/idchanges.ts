import { Router } from "express";
import { db, idChangesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

const TEXT_FIELDS = ["dienstnummer", "name", "rank", "eigeneId", "neueId", "datum", "uhrzeitAnfang", "uhrzeitEnde"] as const;
const REQUIRED_FIELDS = ["dienstnummer", "name", "rank"] as const;

type Patchable = Partial<Pick<typeof idChangesTable.$inferSelect,
  "dienstnummer" | "name" | "rank" | "eigeneId" | "neueId" | "datum" | "uhrzeitAnfang" | "uhrzeitEnde"
>>;

router.get("/", async (req, res) => {
  const rows = await db.select().from(idChangesTable).orderBy(asc(idChangesTable.id));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const dienstnummer = typeof body.dienstnummer === "string" ? body.dienstnummer.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rank = typeof body.rank === "string" ? body.rank.trim() : "";
  if (!dienstnummer || !name || !rank) {
    return res.status(400).json({ error: "Dienstnummer, Name und Rang sind erforderlich" });
  }

  try {
    const [created] = await db.insert(idChangesTable).values({
      dienstnummer,
      name,
      rank,
      eigeneId: typeof body.eigeneId === "string" ? body.eigeneId : null,
      neueId: typeof body.neueId === "string" ? body.neueId : null,
      datum: typeof body.datum === "string" ? body.datum : null,
      uhrzeitAnfang: typeof body.uhrzeitAnfang === "string" ? body.uhrzeitAnfang : null,
      uhrzeitEnde: typeof body.uhrzeitEnde === "string" ? body.uhrzeitEnde : null,
    }).returning();
    return res.status(201).json(created);
  } catch {
    return res.status(500).json({ error: "ID Change konnte nicht angelegt werden" });
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Ungültige ID" });
  }
  const body = req.body as Record<string, unknown>;
  const update: Patchable = {};

  for (const f of TEXT_FIELDS) {
    if (f in body) {
      const v = body[f];
      if ((REQUIRED_FIELDS as readonly string[]).includes(f)) {
        if (typeof v !== "string" || v.trim() === "") {
          return res.status(400).json({ error: `${f} darf nicht leer sein` });
        }
        (update as Record<string, unknown>)[f] = v.trim();
      } else {
        (update as Record<string, unknown>)[f] = v === null ? null : String(v);
      }
    }
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: "Keine änderbaren Felder angegeben" });
  }

  const [updated] = await db
    .update(idChangesTable)
    .set(update)
    .where(eq(idChangesTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "ID Change nicht gefunden" });
  return res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Ungültige ID" });
  }
  const deleted = await db.delete(idChangesTable).where(eq(idChangesTable.id, id)).returning();
  if (deleted.length === 0) {
    return res.status(404).json({ error: "ID Change nicht gefunden" });
  }
  return res.status(204).end();
});

export default router;
