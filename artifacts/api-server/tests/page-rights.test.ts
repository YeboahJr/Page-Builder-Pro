import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import { db, pool, officersTable, sessionsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import app from "../src/app";
import { hashPassword } from "../src/lib/auth";

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const DASH_DN = `test-pr-dash-${RUN_ID}`;
const LEIT_DN = `test-pr-leit-${RUN_ID}`;
const NULL_DN = `test-pr-null-${RUN_ID}`;
const LEAD_DN = `test-pr-lead-${RUN_ID}`;
const PASSWORD = "test-passwort";

let server: Server;
let baseUrl: string;
let tokenDash: string;
let tokenLeit: string;
let tokenNull: string;
let tokenLead: string;

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
    .where(inArray(officersTable.dienstnummer, [DASH_DN, LEIT_DN, NULL_DN, LEAD_DN]));
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
    { ...base, dienstnummer: DASH_DN, name: `Test PR Dash ${RUN_ID}`, rank: "Special Agent", allowedPages: ["dashboard"] },
    { ...base, dienstnummer: LEIT_DN, name: `Test PR Leit ${RUN_ID}`, rank: "Special Agent", allowedPages: ["leitstelle"] },
    { ...base, dienstnummer: NULL_DN, name: `Test PR Null ${RUN_ID}`, rank: "Special Agent", allowedPages: null },
    // Leadership with an (irrelevant) restriction — must still see everything.
    { ...base, dienstnummer: LEAD_DN, name: `Test PR Lead ${RUN_ID}`, rank: "Division Chief", allowedPages: ["dashboard"] },
  ]);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to determine test server port");
  }
  baseUrl = `http://127.0.0.1:${address.port}/api`;

  tokenDash = await login(DASH_DN);
  tokenLeit = await login(LEIT_DN);
  tokenNull = await login(NULL_DN);
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

describe("page rights enforcement on data routes", () => {
  it("rejects unauthenticated access to previously open data routes", async () => {
    for (const path of ["/patrols", "/reports", "/evidence", "/idchanges", "/officers", "/dashboard/stats"]) {
      const res = await api(path);
      expect(res.status, path).toBe(401);
    }
  });

  it("blocks data of pages the officer is not allowed to see", async () => {
    // dashboard-only officer: no leitstelle/personal/fallmanagement data
    for (const path of ["/reports", "/patrols", "/officers", "/idchanges", "/evidence"]) {
      const res = await api(path, { token: tokenDash });
      expect(res.status, `dash → ${path}`).toBe(403);
    }
    // leitstelle-only officer: no dashboard/cases/personal-management data
    for (const path of ["/dashboard/stats", "/dashboard/recent-activity", "/cases", "/idchanges", "/evidence"]) {
      const res = await api(path, { token: tokenLeit });
      expect(res.status, `leit → ${path}`).toBe(403);
    }
  });

  it("blocks page-gated write routes too", async () => {
    const createReport = await api("/reports", {
      method: "POST",
      token: tokenDash,
      body: { type: "TEST", title: "x", location: "y" },
    });
    expect(createReport.status).toBe(403);

    const createOfficer = await api("/officers", {
      method: "POST",
      token: tokenDash,
      body: { dienstnummer: `test-pr-x-${RUN_ID}`, name: "x", rank: "Special Agent" },
    });
    expect(createOfficer.status).toBe(403);

    const deleteOfficer = await api("/officers/999999", { method: "DELETE", token: tokenLeit });
    expect(deleteOfficer.status).toBe(403);
  });

  it("allows data of pages the officer is allowed to see", async () => {
    const stats = await api("/dashboard/stats", { token: tokenDash });
    expect(stats.status).toBe(200);
    const cases = await api("/cases", { token: tokenDash });
    expect(cases.status).toBe(200);

    const patrols = await api("/patrols", { token: tokenLeit });
    expect(patrols.status).toBe(200);
    const reports = await api("/reports", { token: tokenLeit });
    expect(reports.status).toBe(200);
    // officer list backs the Leitstelle patrol assignment as well
    const officers = await api("/officers", { token: tokenLeit });
    expect(officers.status).toBe(200);
  });

  it("treats allowedPages null as full access", async () => {
    for (const path of ["/dashboard/stats", "/cases", "/reports", "/patrols", "/officers", "/idchanges", "/evidence"]) {
      const res = await api(path, { token: tokenNull });
      expect(res.status, `null → ${path}`).toBe(200);
    }
  });

  it("always allows leadership regardless of allowedPages", async () => {
    for (const path of ["/dashboard/stats", "/cases", "/reports", "/patrols", "/officers", "/idchanges", "/evidence"]) {
      const res = await api(path, { token: tokenLead });
      expect(res.status, `lead → ${path}`).toBe(200);
    }
  });

  it("keeps self-service routes usable without page rights", async () => {
    // dashboard-only officer must still be able to change their own password
    const me = await api("/auth/me", { token: tokenDash });
    expect(me.status).toBe(200);
    const officerId = me.json.officer?.id ?? me.json.id;
    const pw = await api(`/officers/${officerId}/password`, {
      method: "POST",
      token: tokenDash,
      body: { currentPassword: PASSWORD, newPassword: PASSWORD },
    });
    expect(pw.status).toBe(200);
  });
});
