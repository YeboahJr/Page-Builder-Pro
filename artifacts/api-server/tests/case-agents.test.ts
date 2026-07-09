import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import { db, pool, officersTable, sessionsTable, casesTable, caseAgentsTable, caseStatusHistoryTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import app from "../src/app";
import { hashPassword } from "../src/lib/auth";

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const LEAD_DN = `test-ca-lead-${RUN_ID}`;
const MEMBER_DN = `test-ca-member-${RUN_ID}`;
const ADDED_DN = `test-ca-added-${RUN_ID}`;
const OUTSIDER_DN = `test-ca-out-${RUN_ID}`;
const PENDING_DN = `test-ca-pending-${RUN_ID}`;
const PASSWORD = "test-passwort";
const NAME_LEAD = `Test CA Lead ${RUN_ID}`;
const NAME_MEMBER = `Test CA Member ${RUN_ID}`;
const NAME_ADDED = `Test CA Added ${RUN_ID}`;
const NAME_OUTSIDER = `Test CA Outsider ${RUN_ID}`;
const NAME_PENDING = `Test CA Pending ${RUN_ID}`;

let server: Server;
let baseUrl: string;
let tokenMember: string;
let tokenAdded: string;
let tokenOutsider: string;
let caseId: number;

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
  if (caseId) {
    await db.delete(caseAgentsTable).where(inArray(caseAgentsTable.caseId, [caseId]));
    await db.delete(caseStatusHistoryTable).where(inArray(caseStatusHistoryTable.caseId, [caseId]));
    await db.delete(casesTable).where(inArray(casesTable.id, [caseId]));
  }
  const officers = await db
    .select({ id: officersTable.id })
    .from(officersTable)
    .where(inArray(officersTable.dienstnummer, [LEAD_DN, MEMBER_DN, ADDED_DN, OUTSIDER_DN, PENDING_DN]));
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
  await db.insert(officersTable).values([
    { ...base, dienstnummer: LEAD_DN, name: NAME_LEAD, rank: "Special Agent" },
    // Case-involved officer WITHOUT personal/leitstelle page rights — must
    // still be able to load the name directory and manage case agents.
    { ...base, dienstnummer: MEMBER_DN, name: NAME_MEMBER, rank: "Special Agent", allowedPages: ["dashboard"] },
    { ...base, dienstnummer: ADDED_DN, name: NAME_ADDED, rank: "Special Agent", allowedPages: ["dashboard"] },
    { ...base, dienstnummer: OUTSIDER_DN, name: NAME_OUTSIDER, rank: "Special Agent", allowedPages: ["dashboard"] },
    { ...base, dienstnummer: PENDING_DN, name: NAME_PENDING, rank: "Special Agent", freigegeben: false },
  ]);

  const [created] = await db
    .insert(casesTable)
    .values({
      caseNumber: `SID-TEST-CA-${RUN_ID}`,
      title: `Test CA Fall ${RUN_ID}`,
      category: "Drogenkriminalität",
      priority: "Mittel",
      status: "Offen",
      leadAgent: NAME_LEAD,
    })
    .returning({ id: casesTable.id });
  caseId = created.id;
  await db.insert(caseAgentsTable).values([
    { caseId, name: NAME_LEAD, role: "Leitender Agent" },
    { caseId, name: NAME_MEMBER, role: "Unterstützender Agent" },
  ]);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to determine test server port");
  }
  baseUrl = `http://127.0.0.1:${address.port}/api`;

  tokenMember = await login(MEMBER_DN);
  tokenAdded = await login(ADDED_DN);
  tokenOutsider = await login(OUTSIDER_DN);
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

describe("officer name directory (/officers/names)", () => {
  it("requires authentication", async () => {
    const res = await api("/officers/names");
    expect(res.status).toBe(401);
  });

  it("is accessible without personal/leitstelle page rights and only exposes id + name of approved officers", async () => {
    const res = await api("/officers/names", { token: tokenMember });
    expect(res.status).toBe(200);
    const names = res.json.map((o: { name: string }) => o.name);
    expect(names).toContain(NAME_ADDED);
    expect(names).not.toContain(NAME_PENDING);
    for (const entry of res.json) {
      expect(Object.keys(entry).sort()).toEqual(["id", "name"]);
    }
    // The full officer list must stay page-gated for this officer.
    const full = await api("/officers", { token: tokenMember });
    expect(full.status).toBe(403);
  });
});

describe("case agent management (/cases/:id/agents)", () => {
  it("rejects unauthenticated and uninvolved users", async () => {
    const unauth = await api(`/cases/${caseId}/agents`, { method: "POST", body: { name: NAME_ADDED } });
    expect(unauth.status).toBe(401);
    const outsider = await api(`/cases/${caseId}/agents`, {
      method: "POST",
      token: tokenOutsider,
      body: { name: NAME_ADDED },
    });
    expect(outsider.status).toBe(403);
  });

  it("lets an involved officer without personal/leitstelle rights add an agent, who then sees the case", async () => {
    const before = await api("/cases", { token: tokenAdded });
    expect(before.status).toBe(200);
    expect(before.json.some((c: { id: number }) => c.id === caseId)).toBe(false);

    const added = await api(`/cases/${caseId}/agents`, {
      method: "POST",
      token: tokenMember,
      body: { name: NAME_ADDED },
    });
    expect(added.status).toBe(201);
    expect(added.json.role).toBe("Unterstützender Agent");

    const after = await api("/cases", { token: tokenAdded });
    expect(after.json.some((c: { id: number }) => c.id === caseId)).toBe(true);
  });

  it("rejects invalid additions", async () => {
    const unknown = await api(`/cases/${caseId}/agents`, {
      method: "POST",
      token: tokenMember,
      body: { name: `Unbekannt ${RUN_ID}` },
    });
    expect(unknown.status).toBe(400);

    const pending = await api(`/cases/${caseId}/agents`, {
      method: "POST",
      token: tokenMember,
      body: { name: NAME_PENDING },
    });
    expect(pending.status).toBe(400);

    const lead = await api(`/cases/${caseId}/agents`, {
      method: "POST",
      token: tokenMember,
      body: { name: NAME_LEAD },
    });
    expect(lead.status).toBe(400);

    const duplicate = await api(`/cases/${caseId}/agents`, {
      method: "POST",
      token: tokenMember,
      body: { name: NAME_ADDED },
    });
    expect(duplicate.status).toBe(400);

    const badRole = await api(`/cases/${caseId}/agents`, {
      method: "POST",
      token: tokenMember,
      body: { name: NAME_OUTSIDER, role: "Leitender Agent" },
    });
    expect(badRole.status).toBe(400);
  });

  it("removes an agent (204) and revokes their case visibility", async () => {
    const agents = await api(`/cases/${caseId}/agents`, { token: tokenMember });
    expect(agents.status).toBe(200);
    const addedRow = agents.json.find((a: { name: string }) => a.name === NAME_ADDED);
    expect(addedRow).toBeDefined();

    const removed = await api(`/cases/${caseId}/agents/${addedRow.id}`, {
      method: "DELETE",
      token: tokenMember,
    });
    expect(removed.status).toBe(204);

    const after = await api("/cases", { token: tokenAdded });
    expect(after.json.some((c: { id: number }) => c.id === caseId)).toBe(false);
  });

  it("refuses to remove the lead agent row", async () => {
    const agents = await api(`/cases/${caseId}/agents`, { token: tokenMember });
    const leadRow = agents.json.find((a: { role: string }) => a.role === "Leitender Agent");
    expect(leadRow).toBeDefined();

    const res = await api(`/cases/${caseId}/agents/${leadRow.id}`, {
      method: "DELETE",
      token: tokenMember,
    });
    expect(res.status).toBe(400);

    const missing = await api(`/cases/${caseId}/agents/999999`, {
      method: "DELETE",
      token: tokenMember,
    });
    expect(missing.status).toBe(404);
  });
});
