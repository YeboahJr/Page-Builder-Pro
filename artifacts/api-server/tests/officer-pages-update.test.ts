import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import { db, pool, officersTable, sessionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import app from "../src/app";
import { hashPassword } from "../src/lib/auth";

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const LEAD_DN = `test-opu-lead-${RUN_ID}`;
const AGENT_DN = `test-opu-agent-${RUN_ID}`;
const TARGET_DN = `test-opu-target-${RUN_ID}`;
const PASSWORD = "test-passwort";

let server: Server;
let baseUrl: string;
let tokenLead: string;
let tokenAgent: string;
let targetId: number;

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
    .where(inArray(officersTable.dienstnummer, [LEAD_DN, AGENT_DN, TARGET_DN]));
  const ids = officers.map((o) => o.id);
  if (ids.length > 0) {
    await db.delete(sessionsTable).where(inArray(sessionsTable.officerId, ids));
    await db.delete(officersTable).where(inArray(officersTable.id, ids));
  }
}

async function login(dienstnummer: string): Promise<string> {
  const res = await api("/auth/login", {
    method: "POST",
    body: { dienstnummer, passwort: PASSWORD },
  });
  expect(res.status).toBe(200);
  return res.json.token;
}

beforeAll(async () => {
  const base = {
    passwortHash: hashPassword(PASSWORD),
    status: "Anwesend",
    freigegeben: true,
  };
  const inserted = await db
    .insert(officersTable)
    .values([
      { ...base, dienstnummer: LEAD_DN, name: `Test OPU Lead ${RUN_ID}`, rank: "Division Chief", role: "Leitung" },
      { ...base, dienstnummer: AGENT_DN, name: `Test OPU Agent ${RUN_ID}`, rank: "Special Agent" },
      { ...base, dienstnummer: TARGET_DN, name: `Test OPU Target ${RUN_ID}`, rank: "Special Agent", allowedPages: null },
    ])
    .returning();
  targetId = inserted.find((o) => o.dienstnummer === TARGET_DN)!.id;

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to determine test server port");
  }
  baseUrl = `http://127.0.0.1:${address.port}/api`;

  tokenLead = await login(LEAD_DN);
  tokenAgent = await login(AGENT_DN);
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

describe("PUT /officers/:id/pages", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await api(`/officers/${targetId}/pages`, {
      method: "PUT",
      body: { allowedPages: ["dashboard"] },
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-leadership officers with 403", async () => {
    const res = await api(`/officers/${targetId}/pages`, {
      method: "PUT",
      token: tokenAgent,
      body: { allowedPages: ["dashboard"] },
    });
    expect(res.status).toBe(403);
  });

  it("rejects unknown page keys with 400", async () => {
    const res = await api(`/officers/${targetId}/pages`, {
      method: "PUT",
      token: tokenLead,
      body: { allowedPages: ["dashboard", "geheim"] },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a missing or non-array allowedPages with 400", async () => {
    const missing = await api(`/officers/${targetId}/pages`, {
      method: "PUT",
      token: tokenLead,
      body: {},
    });
    expect(missing.status).toBe(400);

    const notArray = await api(`/officers/${targetId}/pages`, {
      method: "PUT",
      token: tokenLead,
      body: { allowedPages: "dashboard" },
    });
    expect(notArray.status).toBe(400);
  });

  it("rejects an invalid officer id with 400", async () => {
    const res = await api(`/officers/abc/pages`, {
      method: "PUT",
      token: tokenLead,
      body: { allowedPages: ["dashboard"] },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown officer", async () => {
    const res = await api(`/officers/999999999/pages`, {
      method: "PUT",
      token: tokenLead,
      body: { allowedPages: ["dashboard"] },
    });
    expect(res.status).toBe(404);
  });

  it("failed attempts did not change the stored page rights", async () => {
    const [target] = await db
      .select()
      .from(officersTable)
      .where(eq(officersTable.id, targetId));
    expect(target.allowedPages).toBeNull();
  });

  it("lets leadership update page rights with 200 and persists them", async () => {
    const res = await api(`/officers/${targetId}/pages`, {
      method: "PUT",
      token: tokenLead,
      body: { allowedPages: ["dashboard", "archiv"] },
    });
    expect(res.status).toBe(200);
    expect(res.json.allowedPages).toEqual(["dashboard", "archiv"]);
    expect(res.json.passwortHash).toBeUndefined();

    const [target] = await db
      .select()
      .from(officersTable)
      .where(eq(officersTable.id, targetId));
    expect(target.allowedPages).toEqual(["dashboard", "archiv"]);
  });

  it("accepts an empty array (officer sees no pages)", async () => {
    const res = await api(`/officers/${targetId}/pages`, {
      method: "PUT",
      token: tokenLead,
      body: { allowedPages: [] },
    });
    expect(res.status).toBe(200);
    expect(res.json.allowedPages).toEqual([]);
  });
});
