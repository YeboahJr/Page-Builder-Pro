import crypto from "crypto";
import { db, officersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "fib_salt_2026").digest("hex");
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Unsichtbare Berechtigungsrollen (officers.role):
// Admin, Direktion und Leitung haben alle Rechte; Agent und STA haben nur
// die ihnen per allowedPages zugewiesenen Seitenrechte. Die sichtbaren
// FIB-Ränge (officers.rank) sind rein kosmetisch und vergeben keine Rechte mehr.
export const ROLES = ["Admin", "Direktion", "Leitung", "Agent", "STA"] as const;
export type Role = (typeof ROLES)[number];

export const FULL_ACCESS_ROLES = new Set<string>(["Admin", "Direktion", "Leitung"]);

export function hasFullAccess(role: string | null | undefined): boolean {
  return role != null && FULL_ACCESS_ROLES.has(role);
}

type AuthRequest = {
  headers: { authorization?: string };
  cookies?: { auth_token?: string };
};

export async function resolveOfficer(req: AuthRequest): Promise<typeof officersTable.$inferSelect | null> {
  const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.auth_token;
  if (!token) return null;
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token));
  if (!session || session.expiresAt < new Date()) return null;
  const [officer] = await db.select().from(officersTable).where(eq(officersTable.id, session.officerId));
  return officer ?? null;
}
