import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import { db, pool, officersTable, sessionsTable, casesTable, caseAgentsTable, caseStatusHistoryTable, casePersonsTable, evidenceFilesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import app from "../src/app";
import { hashPassword } from "../src/lib/auth";

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const OFFICER_A_DN = `test-cv-a-${RUN_ID}`;
const OFFICER_B_DN = `test-cv-b-${RUN_ID}`;
const LEADER_DN = `test-cv-l-${RUN_ID}`;
const PASSWORD = "test-passwort";
const NAME_A = `Test CV Officer A ${RUN_ID}`;
const NAME_B = `Test CV Officer B ${RUN_ID}`;
const NAME_L = `Test CV Leader ${RUN_ID}`;

let server: Server;
let baseUrl: string;
let tokenA: string;
let tokenB: string;
let tokenL: string;
const createdCaseIds: number[] = [];

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
  if (createdCaseIds.length > 0) {
    await db.delete(evidenceFilesTable).where(inArray(evidenceFilesTable.caseId, createdCaseIds));
    await db.delete(casePersonsTable).where(inArray(casePersonsTable.caseId, createdCaseIds));
    await db.delete(caseAgentsTable).where(inArray(caseAgentsTable.caseId, createdCaseIds));
    await db.delete(caseStatusHistoryTable).where(inArray(caseStatusHistoryTable.caseId, createdCaseIds));
    await db.delete(casesTable).where(inArray(casesTable.id, createdCaseIds));
  }
  const officers = await db
    .select({ id: officersTable.id })
    .from(officersTable)
    .where(inArray(officersTable.dienstnummer, [OFFICER_A_DN, OFFICER_B_DN, LEADER_DN]));
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
    { ...base, dienstnummer: OFFICER_A_DN, name: NAME_A, rank: "Special Agent", allowedPages: ["dashboard", "fallmanagement"] },
    { ...base, dienstnummer: OFFICER_B_DN, name: NAME_B, rank: "Special Agent", allowedPages: ["dashboard", "fallmanagement"] },
    { ...base, dienstnummer: LEADER_DN, name: NAME_L, rank: "Division Chief", role: "Leitung" },
  ]);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to determine test server port");
  }
  baseUrl = `http://127.0.0.1:${address.port}/api`;

  tokenA = await login(OFFICER_A_DN);
  tokenB = await login(OFFICER_B_DN);
  tokenL = await login(LEADER_DN);
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

describe("case visibility", () => {
  let caseAId: number;
  let caseForeignLeadId: number;

  it("rejects unauthenticated case listing and creation", async () => {
    const list = await api("/cases");
    expect(list.status).toBe(401);
    const create = await api("/cases", {
      method: "POST",
      body: { title: "x", category: "Korruption", leadAgent: NAME_A },
    });
    expect(create.status).toBe(401);
  });

  it("lets an officer create a case where they are the lead agent", async () => {
    const res = await api("/cases", {
      method: "POST",
      token: tokenA,
      body: { title: `CV Fall A ${RUN_ID}`, category: "Korruption", leadAgent: NAME_A },
    });
    expect(res.status).toBe(201);
    caseAId = res.json.id;
    createdCaseIds.push(caseAId);
  });

  it("links the creator to a case created for someone else", async () => {
    const res = await api("/cases", {
      method: "POST",
      token: tokenA,
      body: { title: `CV Fall Fremd ${RUN_ID}`, category: "Korruption", leadAgent: "SA Someone Else" },
    });
    expect(res.status).toBe(201);
    caseForeignLeadId = res.json.id;
    createdCaseIds.push(caseForeignLeadId);

    // Creator still sees their own case even though someone else is lead agent
    const detail = await api(`/cases/${caseForeignLeadId}`, { token: tokenA });
    expect(detail.status).toBe(200);
  });

  it("shows an officer only their own cases in the list", async () => {
    const listA = await api("/cases", { token: tokenA });
    expect(listA.status).toBe(200);
    const idsA = listA.json.map((c: { id: number }) => c.id);
    expect(idsA).toContain(caseAId);
    expect(idsA).toContain(caseForeignLeadId);

    const listB = await api("/cases", { token: tokenB });
    expect(listB.status).toBe(200);
    const idsB = listB.json.map((c: { id: number }) => c.id);
    expect(idsB).not.toContain(caseAId);
    expect(idsB).not.toContain(caseForeignLeadId);
  });

  it("rejects access to a foreign case with 403 (detail, update, delete, sub-resources)", async () => {
    const detail = await api(`/cases/${caseAId}`, { token: tokenB });
    expect(detail.status).toBe(403);

    const patch = await api(`/cases/${caseAId}`, {
      method: "PATCH",
      token: tokenB,
      body: { title: "hijacked" },
    });
    expect(patch.status).toBe(403);

    const del = await api(`/cases/${caseAId}`, { method: "DELETE", token: tokenB });
    expect(del.status).toBe(403);

    for (const sub of ["status-history", "persons", "agents", "evidence/files"]) {
      const res = await api(`/cases/${caseAId}/${sub}`, { token: tokenB });
      expect(res.status).toBe(403);
    }
  });

  it("lets the involved officer read and update their own case", async () => {
    const detail = await api(`/cases/${caseAId}`, { token: tokenA });
    expect(detail.status).toBe(200);
    expect(detail.json.leadAgent).toBe(NAME_A);

    const patch = await api(`/cases/${caseAId}`, {
      method: "PATCH",
      token: tokenA,
      body: { priority: "Hoch" },
    });
    expect(patch.status).toBe(200);
    expect(patch.json.priority).toBe("Hoch");
  });

  it("gives an assigned agent access after being added to the case", async () => {
    await db.insert(caseAgentsTable).values({ caseId: caseAId, name: NAME_B, role: "Agent" });

    const detail = await api(`/cases/${caseAId}`, { token: tokenB });
    expect(detail.status).toBe(200);

    const list = await api("/cases", { token: tokenB });
    const ids = list.json.map((c: { id: number }) => c.id);
    expect(ids).toContain(caseAId);
  });

  it("lets leadership see and edit all cases", async () => {
    const list = await api("/cases", { token: tokenL });
    expect(list.status).toBe(200);
    const ids = list.json.map((c: { id: number }) => c.id);
    expect(ids).toContain(caseAId);
    expect(ids).toContain(caseForeignLeadId);

    const detail = await api(`/cases/${caseForeignLeadId}`, { token: tokenL });
    expect(detail.status).toBe(200);

    const patch = await api(`/cases/${caseForeignLeadId}`, {
      method: "PATCH",
      token: tokenL,
      body: { status: "Aktiv" },
    });
    expect(patch.status).toBe(200);
  });




});
