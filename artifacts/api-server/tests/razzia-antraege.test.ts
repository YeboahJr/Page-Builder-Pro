import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import { db, pool, officersTable, sessionsTable, casesTable, razziaAntraegeTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import app from "../src/app";
import { hashPassword } from "../src/lib/auth";

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const AGENT_DN = `test-rz-agent-${RUN_ID}`;
const LEAD_DN = `test-rz-lead-${RUN_ID}`;
const PASSWORD = "test-passwort";

let server: Server;
let baseUrl: string;
let tokenAgent: string;
let tokenLead: string;
let closedCaseId: number;
let openCaseId: number;
const createdAntragIds: number[] = [];

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
  if (createdAntragIds.length > 0) {
    await db.delete(razziaAntraegeTable).where(inArray(razziaAntraegeTable.id, createdAntragIds));
  }
  const caseIds = [closedCaseId, openCaseId].filter((id): id is number => typeof id === "number");
  if (caseIds.length > 0) {
    await db.delete(casesTable).where(inArray(casesTable.id, caseIds));
  }
  const officers = await db
    .select({ id: officersTable.id })
    .from(officersTable)
    .where(inArray(officersTable.dienstnummer, [AGENT_DN, LEAD_DN]));
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
    // Agent WITH page rights for fallmanagement — must still be blocked.
    { ...base, dienstnummer: AGENT_DN, name: `Test RZ Agent ${RUN_ID}`, rank: "Special Agent", allowedPages: ["dashboard", "fallmanagement"] },
    { ...base, dienstnummer: LEAD_DN, name: `Test RZ Lead ${RUN_ID}`, rank: "Division Chief", role: "Leitung" },
  ]);

  const [closed] = await db
    .insert(casesTable)
    .values({
      caseNumber: `TEST-RZ-CLOSED-${RUN_ID}`,
      title: `Test RZ abgeschlossen ${RUN_ID}`,
      category: "Gang",
      priority: "Mittel",
      status: "Abgeschlossen",
      leadAgent: `Test RZ Lead ${RUN_ID}`,
      straftaten: ["§ 1.1 StGB Mord"],
    })
    .returning({ id: casesTable.id });
  closedCaseId = closed.id;

  const [open] = await db
    .insert(casesTable)
    .values({
      caseNumber: `TEST-RZ-OPEN-${RUN_ID}`,
      title: `Test RZ offen ${RUN_ID}`,
      category: "Gang",
      priority: "Mittel",
      status: "Offen",
      leadAgent: `Test RZ Lead ${RUN_ID}`,
    })
    .returning({ id: casesTable.id });
  openCaseId = open.id;

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to determine test server port");
  }
  baseUrl = `http://127.0.0.1:${address.port}/api`;

  tokenAgent = await login(AGENT_DN);
  tokenLead = await login(LEAD_DN);
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

describe("razzia-antraege role gating", () => {
  it("rejects unauthenticated access", async () => {
    const res = await api("/razzia-antraege");
    expect(res.status).toBe(401);
  });

  it("blocks agents even with page rights on all routes", async () => {
    const list = await api("/razzia-antraege", { token: tokenAgent });
    expect(list.status).toBe(403);

    const create = await api("/razzia-antraege", {
      method: "POST",
      token: tokenAgent,
      body: { target: "X", caseIds: [closedCaseId] },
    });
    expect(create.status).toBe(403);

    const patch = await api("/razzia-antraege/1", {
      method: "PATCH",
      token: tokenAgent,
      body: { target: "X", caseIds: [closedCaseId] },
    });
    expect(patch.status).toBe(403);

    const del = await api("/razzia-antraege/1", { method: "DELETE", token: tokenAgent });
    expect(del.status).toBe(403);

    const doc = await api("/razzia-antraege/1/dokument", { token: tokenAgent });
    expect(doc.status).toBe(403);
  });

  it("allows leadership to list", async () => {
    const res = await api("/razzia-antraege", { token: tokenLead });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json)).toBe(true);
  });
});

describe("razzia-antraege validation", () => {
  it("rejects empty target and empty caseIds", async () => {
    const noTarget = await api("/razzia-antraege", {
      method: "POST",
      token: tokenLead,
      body: { target: "   ", caseIds: [closedCaseId] },
    });
    expect(noTarget.status).toBe(400);

    const noCases = await api("/razzia-antraege", {
      method: "POST",
      token: tokenLead,
      body: { target: "Gang X", caseIds: [] },
    });
    expect(noCases.status).toBe(400);
  });

  it("rejects non-closed and non-existent cases", async () => {
    const open = await api("/razzia-antraege", {
      method: "POST",
      token: tokenLead,
      body: { target: "Gang X", caseIds: [openCaseId] },
    });
    expect(open.status).toBe(400);

    const missing = await api("/razzia-antraege", {
      method: "POST",
      token: tokenLead,
      body: { target: "Gang X", caseIds: [99999999] },
    });
    expect(missing.status).toBe(400);
  });

  it("creates, updates and deletes an antrag with closed cases", async () => {
    const create = await api("/razzia-antraege", {
      method: "POST",
      token: tokenLead,
      body: { target: `Gang Test ${RUN_ID}`, caseIds: [closedCaseId] },
    });
    expect(create.status).toBe(201);
    const id = create.json.id as number;
    createdAntragIds.push(id);
    expect(create.json.target).toBe(`Gang Test ${RUN_ID}`);
    expect(create.json.caseIds).toEqual([closedCaseId]);
    expect(Array.isArray(create.json.cases)).toBe(true);
    expect(create.json.cases[0].id).toBe(closedCaseId);

    const patch = await api(`/razzia-antraege/${id}`, {
      method: "PATCH",
      token: tokenLead,
      body: { target: `Gang Neu ${RUN_ID}`, caseIds: [closedCaseId] },
    });
    expect(patch.status).toBe(200);
    expect(patch.json.target).toBe(`Gang Neu ${RUN_ID}`);

    const patchOpen = await api(`/razzia-antraege/${id}`, {
      method: "PATCH",
      token: tokenLead,
      body: { target: "X", caseIds: [openCaseId] },
    });
    expect(patchOpen.status).toBe(400);

    const del = await api(`/razzia-antraege/${id}`, { method: "DELETE", token: tokenLead });
    expect(del.status).toBe(204);

    const patchGone = await api(`/razzia-antraege/${id}`, {
      method: "PATCH",
      token: tokenLead,
      body: { target: "X", caseIds: [closedCaseId] },
    });
    expect(patchGone.status).toBe(404);
  });
});
