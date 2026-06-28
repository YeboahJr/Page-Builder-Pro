import { Router } from "express";
import { db, officersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const officers = await db.select().from(officersTable);
  res.json(officers.map(o => {
    const { passwortHash: _, ...data } = o;
    return { ...data, avatarUrl: data.avatarUrl ?? null };
  }));
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [officer] = await db.select().from(officersTable).where(eq(officersTable.id, id));
  if (!officer) return res.status(404).json({ error: "Officer nicht gefunden" });
  const { passwortHash: _, ...data } = officer;
  res.json({ ...data, avatarUrl: data.avatarUrl ?? null });
});

export default router;
