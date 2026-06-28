import crypto from "crypto";
import { db, officersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "fib_salt_2026").digest("hex");
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export const LEADERSHIP_RANKS = new Set<string>([
  "Director of FIB",
  "Vize Director of FIB",
  "Assistant Director of FIB",
  "Secretary of FIB",
  "Human Resources Director",
  "Management Chief",
  "Division Chief",
  "Deputy Division Chief",
  "Unit Commander",
  "Management Division Chief",
]);

export function isLeadership(rank: string | null | undefined): boolean {
  return rank != null && LEADERSHIP_RANKS.has(rank);
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
