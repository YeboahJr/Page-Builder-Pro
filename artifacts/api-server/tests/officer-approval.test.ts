import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import { db, pool, officersTable, sessionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import app from "../src/app";
import { hashPassword } from "../src/lib/auth";

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const LEAD_DN = `test-apr-lead-${RUN_ID}`;
const AGENT_DN = `test-apr-agent-${RUN_ID}`;
const PENDING_DN = `test-apr-pending-${RUN_ID}`;
const REJECTEE_DN = `test-apr-rejectee-${RUN_ID}`;
const APPROVED_DN = `test-apr-approved-${RUN_ID}`;
const PASSWORD = "test-passwort";
const ALL_DNS = [LEAD_DN, AGENT_DN, PENDING_DN, REJECTEE_DN, APPROVED_DN];

let server: Server;
let baseUrl: string;
let tokenLead: string;
let tokenAgent: string;
let pendingId: number;
let rejecteeId: number;
let approvedId: number;

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
    .where(inArray(officersTable.dienstnummer, ALL_DNS));
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
      { ...base, dienstnummer: LEAD_DN, name: `Test APR Lead ${RUN_ID}`, rank: "Division Chief" },
      { ...base, dienstnummer: AGENT_DN, name: `Test APR Agent ${RUN_ID}`, rank: "Special Agent" },
      { ...base, dienstnummer: APPROVED_DN, name: `Test APR Approved ${RUN_ID}`, rank: "Special Agent" },
      {
        passwortHash: hashPassword(PASSWORD),
        status: "Abwesend",
        freigegeben: false,
        dienstnummer: PENDING_DN,
        name: `Test APR Pending ${RUN_ID}`,
        rank: "",
        allowedPages: null,
      },
      {
        passwortHash: hashPassword(PASSWORD),
        status: "Abwesend",
        freigegeben: false,
        dienstnummer: REJECTEE_DN,
        name: `Test APR Rejectee ${RUN_ID}`,
        rank: "",
        allowedPages: null,
      },
    ])
    .returning();
  pendingId = inserted.find((o) => o.dienstnummer === PENDING_DN)!.id;
  rejecteeId = inserted.find((o) => o.dienstnummer === REJECTEE_DN)!.id;
  approvedId = inserted.find((o) => o.dienstnummer === APPROVED_DN)!.id;

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

describe("POST /officers/:id/approve", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await api(`/officers/${pendingId}/approve`, {
      method: "POST",
      body: { rank: "Special Agent" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-leadership officers with 403", async () => {
    const res = await api(`/officers/${pendingId}/approve`, {
      method: "POST",
      token: tokenAgent,
      body: { rank: "Special Agent" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a missing rank with 400", async () => {
    const missing = await api(`/officers/${pendingId}/approve`, {
      method: "POST",
      token: tokenLead,
      body: {},
    });
    expect(missing.status).toBe(400);

    const blank = await api(`/officers/${pendingId}/approve`, {
      method: "POST",
      token: tokenLead,
      body: { rank: "   " },
    });
    expect(blank.status).toBe(400);
  });

  it("rejects invalid allowedPages with 400", async () => {
    const unknownKey = await api(`/officers/${pendingId}/approve`, {
      method: "POST",
      token: tokenLead,
      body: { rank: "Special Agent", allowedPages: ["dashboard", "geheim"] },
    });
    expect(unknownKey.status).toBe(400);

    const notArray = await api(`/officers/${pendingId}/approve`, {
      method: "POST",
      token: tokenLead,
      body: { rank: "Special Agent", allowedPages: "dashboard" },
    });
    expect(notArray.status).toBe(400);
  });

  it("rejects an invalid officer id with 400", async () => {
    const res = await api(`/officers/abc/approve`, {
      method: "POST",
      token: tokenLead,
      body: { rank: "Special Agent" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an already approved officer", async () => {
    const res = await api(`/officers/${approvedId}/approve`, {
      method: "POST",
      token: tokenLead,
      body: { rank: "Special Agent" },
    });
    expect(res.status).toBe(404);
  });

  it("failed attempts did not approve the pending officer", async () => {
    const [pending] = await db
      .select()
      .from(officersTable)
      .where(eq(officersTable.id, pendingId));
    expect(pending.freigegeben).toBe(false);
    expect(pending.allowedPages).toBeNull();
  });

  it("lets leadership approve with 200, sets freigegeben and persists page rights", async () => {
    const res = await api(`/officers/${pendingId}/approve`, {
      method: "POST",
      token: tokenLead,
      body: { rank: "Special Agent", allowedPages: ["dashboard", "archiv"] },
    });
    expect(res.status).toBe(200);
    expect(res.json.freigegeben).toBe(true);
    expect(res.json.rank).toBe("Special Agent");
    expect(res.json.allowedPages).toEqual(["dashboard", "archiv"]);
    expect(res.json.passwortHash).toBeUndefined();

    const [approved] = await db
      .select()
      .from(officersTable)
      .where(eq(officersTable.id, pendingId));
    expect(approved.freigegeben).toBe(true);
    expect(approved.rank).toBe("Special Agent");
    expect(approved.allowedPages).toEqual(["dashboard", "archiv"]);
  });

  it("returns 404 when approving the same officer again", async () => {
    const res = await api(`/officers/${pendingId}/approve`, {
      method: "POST",
      token: tokenLead,
      body: { rank: "Special Agent" },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /officers/:id/reject", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await api(`/officers/${rejecteeId}/reject`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("rejects non-leadership officers with 403", async () => {
    const res = await api(`/officers/${rejecteeId}/reject`, {
      method: "POST",
      token: tokenAgent,
    });
    expect(res.status).toBe(403);
  });

  it("rejects an invalid officer id with 400", async () => {
    const res = await api(`/officers/abc/reject`, {
      method: "POST",
      token: tokenLead,
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an already approved officer", async () => {
    const res = await api(`/officers/${approvedId}/reject`, {
      method: "POST",
      token: tokenLead,
    });
    expect(res.status).toBe(404);

    const [stillThere] = await db
      .select()
      .from(officersTable)
      .where(eq(officersTable.id, approvedId));
    expect(stillThere).toBeDefined();
    expect(stillThere.freigegeben).toBe(true);
  });

  it("failed attempts did not delete the pending registration", async () => {
    const [rejectee] = await db
      .select()
      .from(officersTable)
      .where(eq(officersTable.id, rejecteeId));
    expect(rejectee).toBeDefined();
    expect(rejectee.freigegeben).toBe(false);
  });

  it("lets leadership reject a pending registration with 204 and deletes it", async () => {
    const res = await fetch(`${baseUrl}/officers/${rejecteeId}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenLead}` },
    });
    expect(res.status).toBe(204);

    const remaining = await db
      .select()
      .from(officersTable)
      .where(eq(officersTable.id, rejecteeId));
    expect(remaining).toHaveLength(0);
  });

  it("returns 404 when rejecting the same officer again", async () => {
    const res = await api(`/officers/${rejecteeId}/reject`, {
      method: "POST",
      token: tokenLead,
    });
    expect(res.status).toBe(404);
  });
});
