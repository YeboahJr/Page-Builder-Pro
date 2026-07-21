// Google-Docs-Integration (Replit-Connector "google-docs" + "google-drive"):
// Erstellt die Fallakte als Google-Docs-Dokument statt als PDF. Der Aufbau
// spiegelt die bisherige PDF-Akte: Seite 1 Beschreibung/Verhandlungsführung/
// Details, Seite 2 Geiseln/Forderungen/Vorgeworfene Straftaten, danach die
// Beweismittel-Bilder und der Signaturblock.
import { ReplitConnectors } from "@replit/connectors-sdk";

export interface AkteDocData {
  caseNumber: string;
  title: string;
  leadAgent: string;
  leadAgentDienstnummer: string | null;
  leadAgentRank: string | null;
  description: string | null;
  details: string | null;
  verhandlungsfuehrung: string | null;
  geiseln: string | null;
  forderungen: string | null;
  straftaten: string[] | null;
  tatDatum: string | null;
  tatWann: string | null;
  tatWo: string | null;
  tatWer: string | null;
  createdAt: Date;
  // Beweisbilder als kurzlebig signierte URLs, damit Google sie beim
  // Einbetten abrufen kann (insertInlineImage lädt die Bilddaten serverseitig).
  images: Array<{ filename: string; description: string | null; url: string }>;
  otherFiles: string[];
}

export interface AkteDocResult {
  documentId: string;
  url: string;
  exportUrl: string;
  title: string;
}

function formatDateDe(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

// Baut die batchUpdate-Requests sequenziell auf und führt den laufenden
// Einfüge-Index mit (Google Docs zählt in UTF-16-Code-Units, wie JS .length).
class DocBuilder {
  requests: object[] = [];
  private idx = 1;

  text(
    t: string,
    style?: { bold?: boolean; italic?: boolean; size?: number; align?: "START" | "CENTER"; color?: { r: number; g: number; b: number } },
  ) {
    const content = t.endsWith("\n") ? t : `${t}\n`;
    const start = this.idx;
    const end = start + content.length;
    this.requests.push({ insertText: { location: { index: start }, text: content } });
    // Leerzeilen haben keinen stylbaren Text — updateTextStyle mit leerer
    // Range lehnt die Docs-API mit HTTP 400 ab.
    if (content === "\n") {
      this.requests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: end },
          paragraphStyle: { alignment: style?.align ?? "START" },
          fields: "alignment",
        },
      });
      this.idx = end;
      return;
    }
    const textStyle: Record<string, unknown> = {
      bold: style?.bold ?? false,
      italic: style?.italic ?? false,
      fontSize: { magnitude: style?.size ?? 11, unit: "PT" },
      weightedFontFamily: { fontFamily: "Arial" },
    };
    const fields = ["bold", "italic", "fontSize", "weightedFontFamily"];
    if (style?.color) {
      textStyle.foregroundColor = { color: { rgbColor: { red: style.color.r, green: style.color.g, blue: style.color.b } } };
      fields.push("foregroundColor");
    }
    this.requests.push({
      updateTextStyle: {
        range: { startIndex: start, endIndex: end - 1 },
        textStyle,
        fields: fields.join(","),
      },
    });
    this.requests.push({
      updateParagraphStyle: {
        range: { startIndex: start, endIndex: end },
        paragraphStyle: { alignment: style?.align ?? "START" },
        fields: "alignment",
      },
    });
    this.idx = end;
  }

  heading(label: string) {
    this.text(label, { bold: true });
  }

  pageBreak() {
    // Ein Seitenumbruch belegt genau einen Index.
    this.requests.push({ insertPageBreak: { location: { index: this.idx } } });
    this.idx += 1;
  }

  rule() {
    // Dünne Linie wie im PDF-Briefkopf: leerer Absatz mit unterer Rahmenlinie.
    const start = this.idx;
    this.requests.push({ insertText: { location: { index: start }, text: "\n" } });
    this.requests.push({
      updateParagraphStyle: {
        range: { startIndex: start, endIndex: start + 1 },
        paragraphStyle: {
          borderBottom: {
            width: { magnitude: 1, unit: "PT" },
            padding: { magnitude: 1, unit: "PT" },
            dashStyle: "SOLID",
            color: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
          },
        },
        fields: "borderBottom",
      },
    });
    this.idx = start + 1;
  }

  image(uri: string) {
    // Ein Inline-Bild belegt einen Index; danach folgt eine neue Zeile.
    this.requests.push({
      insertInlineImage: {
        location: { index: this.idx },
        uri,
        objectSize: {
          width: { magnitude: 440, unit: "PT" },
        },
      },
    });
    this.idx += 1;
    this.text("");
  }
}

export function buildAkteDocRequests(data: AkteDocData): object[] {
  const b = new DocBuilder();

  // ---------- Briefkopf ----------
  b.text("U.S. Department of Justice", { size: 18 });
  b.text("Federal Investigation Bureau", { size: 18, bold: true });
  const sachbearbeiter = data.leadAgentDienstnummer
    ? `DN-${data.leadAgentDienstnummer} | ${data.leadAgent}`
    : data.leadAgent;
  b.text(
    `Aktenzeichen: ${data.caseNumber}    Sachbearbeiter: ${sachbearbeiter}    Datum: ${formatDateDe(data.createdAt)}`,
    { size: 10 },
  );
  b.rule();
  b.text("");
  b.text(data.title, { size: 20, bold: true, align: "CENTER" });
  b.text("");

  // ---------- Seite 1: Beschreibung, Verhandlungsführung, Details ----------
  if (data.description?.trim()) {
    b.heading("Beschreibung:");
    b.text(data.description.trim());
    b.text("");
  }
  if (data.verhandlungsfuehrung?.trim()) {
    b.heading("Verhandlungsführung:");
    b.text(data.verhandlungsfuehrung.trim());
    b.text("");
  }
  const hasTatFacts = data.tatDatum || data.tatWann || data.tatWo || data.tatWer;
  if (data.details?.trim() || hasTatFacts) {
    b.heading("Details:");
    if (data.details?.trim()) b.text(data.details.trim());
    const facts: Array<[string, string | null]> = [
      ["Datum:", data.tatDatum],
      ["Zeit:", data.tatWann],
      ["Wo:", data.tatWo],
      ["Wer:", data.tatWer],
    ];
    for (const [label, value] of facts) {
      if (!value?.trim()) continue;
      b.text(`${label} ${value.trim()}`);
    }
    b.text("");
  }

  // ---------- Seite 2: Geiseln, Forderungen, Vorgeworfene Straftaten ----------
  const hasGeiseln = Boolean(data.geiseln?.trim());
  const hasForderungen = Boolean(data.forderungen?.trim());
  const hasStraftaten = (data.straftaten?.length ?? 0) > 0;
  if (hasGeiseln || hasForderungen || hasStraftaten) {
    b.pageBreak();
  }
  if (hasGeiseln) {
    b.heading("Geiseln:");
    b.text(data.geiseln!.trim());
    b.text("");
  }
  if (hasForderungen) {
    b.heading("Forderungen:");
    b.text(data.forderungen!.trim());
    b.text("");
  }
  if (hasStraftaten) {
    b.heading("Vorgeworfene Straftaten:");
    for (const s of data.straftaten!) b.text(s);
    b.text("");
  }

  // ---------- Danach: Beweismittel ----------
  if (data.images.length > 0 || data.otherFiles.length > 0) {
    b.pageBreak();
    b.heading("Beweismittel:");
    let i = 0;
    for (const img of data.images) {
      i += 1;
      b.image(img.url);
      b.text(`Bild ${i}: ${img.description || img.filename}`);
      b.text("");
    }
    if (data.otherFiles.length > 0) {
      b.heading("Weitere Anhänge:");
      for (const f of data.otherFiles) b.text(f, { size: 10 });
      b.text("");
    }
  }

  // ---------- Signaturblock ----------
  b.text("");
  b.text("Federal Investigation Bureau", { size: 13, bold: true, align: "CENTER" });
  b.text(data.leadAgent, { size: 16, italic: true, align: "CENTER", color: { r: 0.12, g: 0.23, b: 0.58 } });
  const rangZeile = [
    data.leadAgentRank?.trim() || null,
    data.leadAgentDienstnummer ? `DN-${data.leadAgentDienstnummer}` : null,
  ].filter(Boolean).join(" | ");
  if (rangZeile) b.text(rangZeile, { align: "CENTER" });
  b.text("");
  b.rule();
  b.text("Dieses Dokument wurde elektronisch erstellt und ist auch mit digitaler Unterschrift gültig.", { size: 10 });

  return b.requests;
}

// Erstellt das Google-Docs-Dokument, befüllt es und gibt es per Link frei
// ("Jeder mit dem Link kann ansehen"), damit Öffnen/Download ohne Google-Login
// des jeweiligen Beamten funktionieren.
export async function createAkteDoc(data: AkteDocData): Promise<AkteDocResult> {
  // Client nie cachen — der Connector-Proxy kümmert sich um Token-Refresh.
  const connectors = new ReplitConnectors();

  const title = `Akte ${data.caseNumber} – ${data.title}`;
  const createRes = await connectors.proxy("google-docs", "/v1/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!createRes.ok) {
    throw new Error(`Google Docs: Dokument konnte nicht erstellt werden (HTTP ${createRes.status})`);
  }
  const doc = (await createRes.json()) as { documentId: string };
  const documentId = doc.documentId;

  let requests = buildAkteDocRequests(data);
  let updateRes = await connectors.proxy("google-docs", `/v1/documents/${documentId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!updateRes.ok && data.images.length > 0) {
    // Bild-Einbettung kann scheitern (z. B. zu groß / URL nicht abrufbar) —
    // dann ohne eingebettete Bilder erneut versuchen und sie nur auflisten.
    const fallback: AkteDocData = {
      ...data,
      images: [],
      otherFiles: [...data.images.map((i) => i.filename), ...data.otherFiles],
    };
    requests = buildAkteDocRequests(fallback);
    updateRes = await connectors.proxy("google-docs", `/v1/documents/${documentId}:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    });
  }
  if (!updateRes.ok) {
    const body = await updateRes.text();
    throw new Error(`Google Docs: Inhalt konnte nicht geschrieben werden (HTTP ${updateRes.status}): ${body.slice(0, 300)}`);
  }

  // Link-Freigabe über die Drive-API (eigener Connector "google-drive").
  const permRes = await connectors.proxy("google-drive", `/drive/v3/files/${documentId}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!permRes.ok) {
    throw new Error(`Google Drive: Link-Freigabe fehlgeschlagen (HTTP ${permRes.status})`);
  }

  return {
    documentId,
    url: `https://docs.google.com/document/d/${documentId}/edit`,
    exportUrl: `https://docs.google.com/document/d/${documentId}/export?format=docx`,
    title,
  };
}
