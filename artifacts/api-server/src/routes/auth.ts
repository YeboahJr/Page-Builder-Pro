import { Router } from "express";
import { db, officersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "fib_salt_2026").digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

router.post("/login", async (req, res) => {
  const { dienstnummer, passwort } = req.body;
  if (!dienstnummer || !passwort) {
    return res.status(400).json({ error: "Dienstnummer und Passwort erforderlich" });
  }

  const [officer] = await db.select().from(officersTable).where(eq(officersTable.dienstnummer, dienstnummer));
  if (!officer) {
    return res.status(401).json({ error: "Ungültige Anmeldedaten" });
  }

  const hash = hashPassword(passwort);
  if (officer.passwortHash !== hash) {
    return res.status(401).json({ error: "Ungültige Anmeldedaten" });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(sessionsTable).values({ officerId: officer.id, token, expiresAt });

  const { passwortHash: _, ...officerData } = officer;
  res.cookie("auth_token", token, { httpOnly: true, maxAge: 86400000 });
  return res.json({
    officer: {
      ...officerData,
      avatarUrl: officerData.avatarUrl ?? null,
    },
    token,
  });
});

router.get("/me", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.auth_token;
  if (!token) return res.status(401).json({ error: "Nicht angemeldet" });

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token));
  if (!session || session.expiresAt < new Date()) {
    return res.status(401).json({ error: "Sitzung abgelaufen" });
  }

  const [officer] = await db.select().from(officersTable).where(eq(officersTable.id, session.officerId));
  if (!officer) return res.status(401).json({ error: "Officer nicht gefunden" });

  const { passwortHash: _, ...officerData } = officer;
  return res.json({ ...officerData, avatarUrl: officerData.avatarUrl ?? null });
});

router.post("/logout", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.auth_token;
  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  res.clearCookie("auth_token");
  res.json({ success: true });
});

export default router;
