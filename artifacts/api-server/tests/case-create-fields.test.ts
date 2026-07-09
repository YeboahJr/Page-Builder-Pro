import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import { db, pool, officersTable, sessionsTable, casesTable, caseAgentsTable, caseStatusHistoryTable, casePersonsTable, evidenceFilesTable } from "@workspace/db";
import { inArray, eq } from "drizzle-orm";
import app from "../src/app";
import { hashPassword } from "../src/lib/auth";

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const LEADER_DN = `test-ccf-l-${RUN_ID}`;
const PASSWORD = "test-passwort";
const NAME_L = `Test CCF Leader ${RUN_ID}`;
const CUSTOM_NUMBER = `SID-TEST-${RUN_ID}`;

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
    role: "Leitung",
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

describe("case creation: custom case number and details", () => {
  let customCaseId: number;

  it("creates a case with a custom case number and details", async () => {
    const res = await api("/cases", {
      method: "POST",
      token: tokenL,
      body: {
        caseNumber: CUSTOM_NUMBER,
        title: `CCF Fall ${RUN_ID}`,
        category: "Korruption",
        leadAgent: NAME_L,
        description: "Kurzbeschreibung",
        details: "Ausführliche Details",
      },
    });
    expect(res.status).toBe(201);
    customCaseId = res.json.id;
    createdCaseIds.push(customCaseId);
    expect(res.json.caseNumber).toBe(CUSTOM_NUMBER);
    expect(res.json.description).toBe("Kurzbeschreibung");
    expect(res.json.details).toBe("Ausführliche Details");
  });

  it("rejects a duplicate custom case number with 400 (even with surrounding whitespace)", async () => {
    const res = await api("/cases", {
      method: "POST",
      token: tokenL,
      body: {
        caseNumber: `  ${CUSTOM_NUMBER}  `,
        title: `CCF Dup ${RUN_ID}`,
        category: "Korruption",
        leadAgent: NAME_L,
      },
    });
    expect(res.status).toBe(400);
    expect(res.json?.error).toBe("Diese Fallnummer ist bereits vergeben");
  });

  it("auto-generates a case number when caseNumber is empty or missing", async () => {
    for (const body of [
      { title: `CCF Auto ${RUN_ID}`, category: "Korruption", leadAgent: NAME_L, caseNumber: "   " },
      { title: `CCF Auto2 ${RUN_ID}`, category: "Korruption", leadAgent: NAME_L },
    ]) {
      const res = await api("/cases", { method: "POST", token: tokenL, body });
      expect(res.status).toBe(201);
      createdCaseIds.push(res.json.id);
      expect(res.json.caseNumber).toMatch(/^SID-\d{4}\/\d{2}\/\d{2} - /);
    }
  });

  it("returns details in list and detail responses and updates it via PATCH", async () => {
    const list = await api("/cases", { token: tokenL });
    expect(list.status).toBe(200);
    const inList = list.json.find((c: { id: number }) => c.id === customCaseId);
    expect(inList?.details).toBe("Ausführliche Details");

    const patch = await api(`/cases/${customCaseId}`, {
      method: "PATCH",
      token: tokenL,
      body: { details: "Aktualisierte Details" },
    });
    expect(patch.status).toBe(200);
    expect(patch.json.details).toBe("Aktualisierte Details");

    const detail = await api(`/cases/${customCaseId}`, { token: tokenL });
    expect(detail.status).toBe(200);
    expect(detail.json.details).toBe("Aktualisierte Details");
    expect(detail.json.description).toBe("Kurzbeschreibung");
  });
});
