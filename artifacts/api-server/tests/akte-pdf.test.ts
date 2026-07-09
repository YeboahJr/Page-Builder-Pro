import { describe, expect, it } from "vitest";
import { buildAktePdf, type AktePdfData } from "../src/lib/aktePdf";

function renderPdf(data: AktePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = buildAktePdf(data);
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function countPages(pdf: Buffer): number {
  return pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
}

function baseData(overrides: Partial<AktePdfData> = {}): AktePdfData {
  return {
    caseNumber: "SID-2026/07/01-Test-01",
    title: "Testakte",
    category: "Test",
    priority: "Mittel",
    status: "Offen",
    leadAgent: "Max Mustermann",
    leadAgentDienstnummer: "42",
    leadAgentRank: "Agent",
    description: "Beschreibungstext.",
    details: "Detailtext.",
    verhandlungsfuehrung: null,
    straftaten: ["§ 1 StGB - Test"],
    tatDatum: "2026-07-01",
    tatWann: "20:00",
    tatWo: "Testort",
    tatWer: "Testgruppe",
    createdAt: new Date("2026-07-01T12:00:00Z"),
    agents: [],
    images: [],
    otherFiles: [],
    ...overrides,
  };
}

describe("buildAktePdf", () => {
  it("renders the restructured Akte with a bounded page count", async () => {
    const pdf = await renderPdf(baseData());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // Page 1: Beschreibung, Seite 2: Details & Straftaten (kein Beweismaterial).
    expect(countPages(pdf)).toBe(2);
  });

  it("terminates with extremely long header fields (no recursive pageAdded)", async () => {
    const pdf = await renderPdf(
      baseData({
        caseNumber: "SID-".repeat(500),
        leadAgent: "SehrLangerName ".repeat(200),
        leadAgentDienstnummer: "9".repeat(300),
        title: "Langer Titel ".repeat(50),
      }),
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // The letterhead must never spill over and create extra pages.
    expect(countPages(pdf)).toBeLessThanOrEqual(4);
  }, 15000);

  it("skips the Details page when there is no page-2 content", async () => {
    const pdf = await renderPdf(
      baseData({ details: null, straftaten: null, tatDatum: null, tatWann: null, tatWo: null, tatWer: null }),
    );
    expect(countPages(pdf)).toBe(1);
  });
});
