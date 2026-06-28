import { Router } from "express";
import { db, officersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, generateToken } from "../lib/auth";

const router = Router();

router.post("/register", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const dienstnummer = typeof body.dienstnummer === "string" ? body.dienstnummer.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const passwort = typeof body.passwort === "string" ? body.passwort : "";

  if (!dienstnummer || !name || !passwort) {
    return res.status(400).json({ error: "Dienstnummer, Name und Passwort sind erforderlich" });
  }

  const [existing] = await db.select().from(officersTable).where(eq(officersTable.dienstnummer, dienstnummer));
  if (existing) {
    return res.status(409).json({ error: "Dienstnummer bereits vergeben" });
  }

  try {
    await db.insert(officersTable).values({
      dienstnummer,
      name,
      rank: "Bewerber",
      passwortHash: hashPassword(passwort),
      status: "Abwesend",
      freigegeben: false,
    });
    return res.status(201).json({
      success: true,
      message: "Registrierung eingereicht. Bitte warte auf die Freigabe durch die Leitung.",
    });
  } catch {
    return res.status(500).json({ error: "Registrierung fehlgeschlagen" });
  }
});

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

  if (!officer.freigegeben) {
    return res.status(403).json({ error: "Registrierung wartet noch auf Freigabe durch die Leitung." });
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
