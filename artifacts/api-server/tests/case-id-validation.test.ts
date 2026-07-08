import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import { db, pool, officersTable, sessionsTable, casesTable, caseAgentsTable, caseStatusHistoryTable, casePersonsTable, evidenceFilesTable } from "@workspace/db";
import { inArray, eq } from "drizzle-orm";
import app from "../src/app";
import { hashPassword } from "../src/lib/auth";

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const LEADER_DN = `test-idv-l-${RUN_ID}`;
const PASSWORD = "test-passwort";
const NAME_L = `Test IDV Leader ${RUN_ID}`;

let server: Server;
let baseUrl: string;
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
    .where(eq(officersTable.dienstnummer, LEADER_DN));
  const ids = officers.map((o) => o.id);
  if (ids.length > 0) {
    await db.delete(sessionsTable).where(inArray(sessionsTable.officerId, ids));
    await db.delete(officersTable).where(inArray(officersTable.id, ids));
  }
}

beforeAll(async () => {
  await db.insert(officersTable).values({
    dienstnummer: LEADER_DN,
    name: NAME_L,
    rank: "Division Chief",
    passwortHash: hashPassword(PASSWORD),
    status: "Anwesend",
    freigegeben: true,
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to determine test server port");
  }
  baseUrl = `http://127.0.0.1:${address.port}/api`;

  const res = await api("/auth/login", {
    method: "POST",
    body: { dienstnummer: LEADER_DN, passwort: PASSWORD },
  });
  expect(res.status).toBe(200);
  tokenL = res.json.token;
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

const MALFORMED_IDS = ["abc", "12abc", "-1", "0", "1.5", "1e2", "%20", "NaN"];

describe("case id validation", () => {
  let caseId: number;
  let otherCaseId: number;

  it("creates test cases", async () => {
    const res = await api("/cases", {
      method: "POST",
      token: tokenL,
      body: { title: `IDV Fall ${RUN_ID}`, category: "Korruption", leadAgent: NAME_L },
    });
    expect(res.status).toBe(201);
    caseId = res.json.id;
    createdCaseIds.push(caseId);

    const res2 = await api("/cases", {
      method: "POST",
      token: tokenL,
      body: { title: `IDV Fall 2 ${RUN_ID}`, category: "Korruption", leadAgent: NAME_L },
    });
    expect(res2.status).toBe(201);
    otherCaseId = res2.json.id;
    createdCaseIds.push(otherCaseId);
  });

  it("rejects malformed ids on GET /cases/:id with 400", async () => {
    for (const bad of MALFORMED_IDS) {
      const res = await api(`/cases/${bad}`, { token: tokenL });
      expect(res.status, `GET /cases/${bad}`).toBe(400);
      expect(res.json?.error).toBe("Ungültige ID");
    }
  });

  it("rejects malformed ids on PATCH /cases/:id with 400", async () => {
    for (const bad of MALFORMED_IDS) {
      const res = await api(`/cases/${bad}`, {
        method: "PATCH",
        token: tokenL,
        body: { title: "x" },
      });
      expect(res.status, `PATCH /cases/${bad}`).toBe(400);
      expect(res.json?.error).toBe("Ungültige ID");
    }
  });

  it("rejects malformed ids on DELETE /cases/:id with 400", async () => {
    for (const bad of MALFORMED_IDS) {
      const res = await api(`/cases/${bad}`, { method: "DELETE", token: tokenL });
      expect(res.status, `DELETE /cases/${bad}`).toBe(400);
      expect(res.json?.error).toBe("Ungültige ID");
    }
  });

  it("rejects malformed ids on sub-resource routes with 400", async () => {
    for (const sub of ["status-history", "persons", "agents", "evidence/files"]) {
      for (const bad of ["abc", "12abc"]) {
        const res = await api(`/cases/${bad}/${sub}`, { token: tokenL });
        expect(res.status, `GET /cases/${bad}/${sub}`).toBe(400);
        expect(res.json?.error).toBe("Ungültige ID");
      }
    }
  });

  it("does not leak another case's data via a suffixed id like '<id>abc'", async () => {
    const res = await api(`/cases/${caseId}abc`, { token: tokenL });
    expect(res.status).toBe(400);
  });

  it("returns 404 on sub-resource routes for a nonexistent case instead of an empty list", async () => {
    const missingId = 999999999;
    for (const sub of ["status-history", "persons", "agents", "evidence/files"]) {
      const res = await api(`/cases/${missingId}/${sub}`, { token: tokenL });
      expect(res.status, `GET /cases/${missingId}/${sub}`).toBe(404);
      expect(res.json?.error).toBe("Fall nicht gefunden");
    }
  });

  it("still serves valid ids normally", async () => {
    const res = await api(`/cases/${caseId}`, { token: tokenL });
    expect(res.status).toBe(200);
    expect(res.json.id).toBe(caseId);

    const agents = await api(`/cases/${caseId}/agents`, { token: tokenL });
    expect(agents.status).toBe(200);
    expect(Array.isArray(agents.json)).toBe(true);
  });
});
