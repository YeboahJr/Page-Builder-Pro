import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import { db, pool, officersTable, sessionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import app from "../src/app";
import { hashPassword } from "../src/lib/auth";

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const OFFICER_A_DN = `test-pw-a-${RUN_ID}`;
const OFFICER_B_DN = `test-pw-b-${RUN_ID}`;
const OLD_PASSWORD = "altes-passwort";
const NEW_PASSWORD = "neues-passwort";

let server: Server;
let baseUrl: string;
let officerAId: number;
let officerBId: number;
let tokenA: string;

async function api(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function cleanup() {
  const officers = await db
    .select({ id: officersTable.id })
    .from(officersTable)
    .where(inArray(officersTable.dienstnummer, [OFFICER_A_DN, OFFICER_B_DN]));
  const ids = officers.map((o) => o.id);
  if (ids.length > 0) {
    await db.delete(sessionsTable).where(inArray(sessionsTable.officerId, ids));
    await db.delete(officersTable).where(inArray(officersTable.id, ids));
  }
}

beforeAll(async () => {
  await cleanup();

  const [a] = await db
    .insert(officersTable)
    .values({
      dienstnummer: OFFICER_A_DN,
      name: "Test Officer A",
      rank: "Special Agent",
      passwortHash: hashPassword(OLD_PASSWORD),
      status: "Anwesend",
      freigegeben: true,
    })
    .returning();
  const [b] = await db
    .insert(officersTable)
    .values({
      dienstnummer: OFFICER_B_DN,
      name: "Test Officer B",
      rank: "Special Agent",
      passwortHash: hashPassword("passwort-b"),
      status: "Anwesend",
      freigegeben: true,
    })
    .returning();
  officerAId = a.id;
  officerBId = b.id;

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to determine test server port");
  }
  baseUrl = `http://127.0.0.1:${address.port}/api`;

  const login = await api("/auth/login", {
    method: "POST",
    body: { dienstnummer: OFFICER_A_DN, passwort: OLD_PASSWORD },
  });
  expect(login.status).toBe(200);
  tokenA = login.json.token;
});

afterAll(async () => {
  await cleanup();
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
  await pool.end();
});

describe("POST /officers/:id/password + login flow", () => {
  it("rejects unauthenticated password change with 401", async () => {
    const res = await api(`/officers/${officerAId}/password`, {
      method: "POST",
      body: { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong current password with 401", async () => {
    const res = await api(`/officers/${officerAId}/password`, {
      method: "POST",
      token: tokenA,
      body: { currentPassword: "falsches-passwort", newPassword: NEW_PASSWORD },
    });
    expect(res.status).toBe(401);
  });

  it("rejects changing another officer's password with 403", async () => {
    const res = await api(`/officers/${officerBId}/password`, {
      method: "POST",
      token: tokenA,
      body: { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(res.status).toBe(403);
  });

  it("failed attempts did not change the stored password", async () => {
    const [a] = await db
      .select()
      .from(officersTable)
      .where(eq(officersTable.id, officerAId));
    expect(a.passwortHash).toBe(hashPassword(OLD_PASSWORD));
    const [b] = await db
      .select()
      .from(officersTable)
      .where(eq(officersTable.id, officerBId));
    expect(b.passwortHash).toBe(hashPassword("passwort-b"));
  });

  it("accepts a valid password change with 200", async () => {
    const res = await api(`/officers/${officerAId}/password`, {
      method: "POST",
      token: tokenA,
      body: { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ success: true });
  });

  it("rejects login with the old password after the change", async () => {
    const res = await api("/auth/login", {
      method: "POST",
      body: { dienstnummer: OFFICER_A_DN, passwort: OLD_PASSWORD },
    });
    expect(res.status).toBe(401);
  });

  it("accepts login with the new password after the change", async () => {
    const res = await api("/auth/login", {
      method: "POST",
      body: { dienstnummer: OFFICER_A_DN, passwort: NEW_PASSWORD },
    });
    expect(res.status).toBe(200);
    expect(res.json.token).toBeTruthy();
    expect(res.json.officer.id).toBe(officerAId);
    expect(res.json.officer.passwortHash).toBeUndefined();
  });

  it("restores the original password so the test is repeatable", async () => {
    const res = await api(`/officers/${officerAId}/password`, {
      method: "POST",
      token: tokenA,
      body: { currentPassword: NEW_PASSWORD, newPassword: OLD_PASSWORD },
    });
    expect(res.status).toBe(200);

    const back = await api("/auth/login", {
      method: "POST",
      body: { dienstnummer: OFFICER_A_DN, passwort: OLD_PASSWORD },
    });
    expect(back.status).toBe(200);
  });
});
