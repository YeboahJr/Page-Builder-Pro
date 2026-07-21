// Google-Docs-Integration (Replit-Connector "google-docs" + "google-drive"):
// Erstellt die Fallakte als Google-Docs-Dokument. Das Design folgt dem vom
// User vorgegebenen Referenz-Dokument: Montserrat 10pt, echte Kopfzeile mit
// DOJ/FIB-Titel und 3-Spalten-Tabelle (Aktenzeichen | Sachbearbeiter | Datum),
// Fußzeile mit "elektronisch erstellt"-Hinweis, fette Inline-Labels,
// Unterstrich-Trennlinie und breite Beweisbilder mit "Bild N:"-Captions.
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

const FONT = "Montserrat";
const SEPARATOR = "____________________________________________________________________________________";

function formatDateDe(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

type Align = "START" | "CENTER" | "END" | "JUSTIFIED";

interface Span {
  t: string;
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: { r: number; g: number; b: number };
}

// Baut die batchUpdate-Requests sequenziell auf und führt den laufenden
// Einfüge-Index mit (Google Docs zählt in UTF-16-Code-Units, wie JS .length).
// Über segmentId auch für Kopf-/Fußzeilen-Segmente nutzbar.
class DocBuilder {
  requests: object[] = [];
  private idx: number;
  private readonly segmentId?: string;

  constructor(opts?: { segmentId?: string; startIndex?: number }) {
    this.segmentId = opts?.segmentId;
    this.idx = opts?.startIndex ?? 1;
  }

  get index(): number {
    return this.idx;
  }

  private loc(index: number): Record<string, unknown> {
    return this.segmentId ? { segmentId: this.segmentId, index } : { index };
  }

  private range(startIndex: number, endIndex: number): Record<string, unknown> {
    return this.segmentId ? { segmentId: this.segmentId, startIndex, endIndex } : { startIndex, endIndex };
  }

  // Ein Absatz aus mehreren Läufen (z. B. fettes Label + normaler Text).
  spans(spans: Span[], opts?: { align?: Align }) {
    const raw = spans.map((s) => s.t).join("");
    const content = raw.endsWith("\n") ? raw : `${raw}\n`;
    const start = this.idx;
    const end = start + content.length;
    this.requests.push({ insertText: { location: this.loc(start), text: content } });
    let cursor = start;
    for (const s of spans) {
      const sStart = cursor;
      const sEnd = cursor + s.t.length;
      cursor = sEnd;
      // updateTextStyle mit leerer Range lehnt die Docs-API mit HTTP 400 ab
      // (Leerzeilen/Umbruchzeichen haben keinen stylbaren Text).
      const styleEnd = Math.min(sEnd, end - 1);
      if (styleEnd <= sStart) continue;
      const textStyle: Record<string, unknown> = {
        bold: s.bold ?? false,
        italic: s.italic ?? false,
        fontSize: { magnitude: s.size ?? 10, unit: "PT" },
        weightedFontFamily: { fontFamily: FONT },
      };
      const fields = ["bold", "italic", "fontSize", "weightedFontFamily"];
      if (s.color) {
        textStyle.foregroundColor = { color: { rgbColor: { red: s.color.r, green: s.color.g, blue: s.color.b } } };
        fields.push("foregroundColor");
      }
      this.requests.push({
        updateTextStyle: {
          range: this.range(sStart, styleEnd),
          textStyle,
          fields: fields.join(","),
        },
      });
    }
    this.requests.push({
      updateParagraphStyle: {
        range: this.range(start, end),
        paragraphStyle: { alignment: opts?.align ?? "JUSTIFIED" },
        fields: "alignment",
      },
    });
    this.idx = end;
  }

  text(t: string, style?: Omit<Span, "t"> & { align?: Align }) {
    this.spans([{ t, bold: style?.bold, italic: style?.italic, size: style?.size, color: style?.color }], {
      align: style?.align,
    });
  }

  empty() {
    this.spans([{ t: "" }]);
  }

  // Fettes Label + normaler Text im selben Absatz (Design des Referenz-Docs).
  labeled(label: string, value: string) {
    this.spans([{ t: `${label}\n`, bold: true }, { t: value }]);
  }

  separator() {
    this.text(SEPARATOR, { align: "JUSTIFIED" });
  }

  image(uri: string) {
    // Ein Inline-Bild belegt einen Index; danach folgt eine neue Zeile.
    this.requests.push({
      insertInlineImage: {
        location: this.loc(this.idx),
        uri,
        objectSize: {
          width: { magnitude: 467, unit: "PT" },
        },
      },
    });
    this.idx += 1;
    this.empty();
  }
}

// Straftaten-Zeile: der Paragraphen-Teil ("§ x.y StGB") ist fett, der Rest normal.
function straftatSpans(s: string): Span[] {
  const m = /^(§+\s*[^ ]*\s*StGB)\s*(.*)$/.exec(s.trim());
  if (m) return [{ t: `${m[1]} `, bold: true }, { t: m[2] }];
  return [{ t: s.trim(), bold: true }];
}

export function buildAkteDocRequests(data: AkteDocData): object[] {
  const b = new DocBuilder();

  b.empty();
  b.text(data.title, { bold: true, size: 16 });
  b.empty();

  if (data.description?.trim()) {
    b.labeled("Beschreibung:", data.description.trim());
    b.empty();
  }
  if (data.verhandlungsfuehrung?.trim()) {
    b.labeled("Verhandlungsführung:", data.verhandlungsfuehrung.trim());
    b.empty();
  }
  if (data.forderungen?.trim()) {
    b.labeled("Forderungen:", data.forderungen.trim());
    b.empty();
  }
  if (data.geiseln?.trim()) {
    b.labeled("Geiseln:", data.geiseln.trim());
    b.empty();
  }

  const hasTatFacts = data.tatDatum || data.tatWann || data.tatWo || data.tatWer;
  if (data.details?.trim() || hasTatFacts) {
    b.separator();
    b.empty();
    if (data.details?.trim()) {
      b.labeled("Details:", data.details.trim());
      b.empty();
    }
    if (hasTatFacts) {
      const facts: Array<[string, string | null]> = [
        ["Datum: \t", data.tatDatum],
        ["Zeit: \t\t", data.tatWann],
        ["Wo: \t\t", data.tatWo],
        ["Wer: \t\t", data.tatWer],
      ];
      for (const [label, value] of facts) {
        if (!value?.trim()) continue;
        b.spans([{ t: label, bold: true }, { t: value.trim() }], { align: "START" });
      }
      b.empty();
    }
  }

  if ((data.straftaten?.length ?? 0) > 0) {
    b.text("Vorgeworfene Straftaten:", { bold: true, align: "START" });
    for (const s of data.straftaten!) b.spans(straftatSpans(s), { align: "START" });
    b.empty();
  }

  if (data.images.length > 0 || data.otherFiles.length > 0) {
    b.empty();
    let i = 0;
    for (const img of data.images) {
      i += 1;
      b.image(img.url);
      b.spans([{ t: `Bild ${i}: `, bold: true }, { t: img.description || img.filename }], { align: "START" });
      b.empty();
    }
    if (data.otherFiles.length > 0) {
      b.text("Weitere Anhänge:", { bold: true, align: "START" });
      for (const f of data.otherFiles) b.text(f, { align: "START" });
      b.empty();
    }
  }

  // Signaturblock
  b.empty();
  b.text("Federal Investigation Bureau", { bold: true, size: 12, align: "CENTER" });
  b.text(data.leadAgent, { italic: true, size: 14, align: "CENTER", color: { r: 0.12, g: 0.23, b: 0.58 } });
  const rangZeile = [
    data.leadAgentRank?.trim() || null,
    data.leadAgentDienstnummer ? `DN-${data.leadAgentDienstnummer}` : null,
  ].filter(Boolean).join(" | ");
  if (rangZeile) b.text(rangZeile, { align: "CENTER" });

  return b.requests;
}

// Dokument-Grundlayout wie im Referenz-Doc: A4, Ränder oben/unten 72pt,
// links ~70.9pt, rechts ~57.3pt.
function documentStyleRequest(): object {
  return {
    updateDocumentStyle: {
      documentStyle: {
        pageSize: {
          width: { magnitude: 595.28, unit: "PT" },
          height: { magnitude: 841.89, unit: "PT" },
        },
        marginTop: { magnitude: 72, unit: "PT" },
        marginBottom: { magnitude: 72, unit: "PT" },
        marginLeft: { magnitude: 70.87, unit: "PT" },
        marginRight: { magnitude: 57.28, unit: "PT" },
      },
      fields: "pageSize,marginTop,marginBottom,marginLeft,marginRight",
    },
  };
}

// Kopfzeilen-Inhalt: DOJ/FIB-Titelzeilen, danach wird die 3-Spalten-Tabelle
// ans Segment-Ende angehängt (Zellen werden in einem Folgeschritt befüllt,
// weil die Zell-Indizes erst nach dem Einfügen der Tabelle bekannt sind).
function buildHeaderRequests(headerId: string): object[] {
  const b = new DocBuilder({ segmentId: headerId, startIndex: 0 });
  b.text("U.S. Department of Justice", { size: 18, align: "START" });
  b.text("Federal Investigation Bureau", { size: 18, bold: true, align: "START" });
  const requests = b.requests;
  requests.push({
    insertTable: { rows: 1, columns: 3, endOfSegmentLocation: { segmentId: headerId } },
  });
  return requests;
}

function buildFooterRequests(footerId: string): object[] {
  const b = new DocBuilder({ segmentId: footerId, startIndex: 0 });
  b.text("Dieses Dokument wurde elektronisch erstellt und ist auch mit digitaler Unterschrift gültig.", {
    size: 8,
    align: "CENTER",
  });
  return b.requests;
}

interface DocsTableCell {
  startIndex: number;
  content: Array<{ paragraph?: unknown; startIndex: number }>;
}
interface DocsStructuralElement {
  startIndex: number;
  table?: { tableRows: Array<{ tableCells: DocsTableCell[] }> };
}

// Befüllt die Kopfzeilen-Tabelle (Aktenzeichen | Sachbearbeiter | Datum) und
// blendet die Zellrahmen aus (weiß, wie im Referenz-Doc). Die Einfügungen
// erfolgen in absteigender Index-Reihenfolge, damit frühere Indizes durch
// spätere Einfügungen nicht verschoben werden.
function buildHeaderTableFillRequests(
  headerId: string,
  headerContent: DocsStructuralElement[],
  data: AkteDocData,
): object[] {
  const tableEl = headerContent.find((el) => el.table);
  if (!tableEl?.table) return [];
  const cells = tableEl.table.tableRows[0]?.tableCells ?? [];
  if (cells.length < 3) return [];

  const sachbearbeiter = data.leadAgentDienstnummer
    ? `DN-${data.leadAgentDienstnummer} | ${data.leadAgent}`
    : data.leadAgent;
  const cellSpans: Span[][] = [
    [{ t: "Aktenzeichen:\n", bold: true }, { t: data.caseNumber }],
    [{ t: "Sachbearbeiter:\n", bold: true }, { t: sachbearbeiter }],
    [{ t: "Datum:\n", bold: true }, { t: formatDateDe(data.createdAt) }],
  ];

  const requests: object[] = [];
  // Zellen von hinten nach vorne befüllen.
  for (let c = cells.length - 1; c >= 0; c--) {
    const spans = cellSpans[c];
    if (!spans) continue;
    // Erste Absatz-Position innerhalb der Zelle (Zellenstart + 1).
    const insertAt = cells[c].startIndex + 1;
    const raw = spans.map((s) => s.t).join("");
    requests.push({ insertText: { location: { segmentId: headerId, index: insertAt }, text: raw } });
    let cursor = insertAt;
    for (const s of spans) {
      const sStart = cursor;
      const sEnd = cursor + s.t.length;
      cursor = sEnd;
      const styleEnd = s.t.endsWith("\n") ? sEnd - 1 : sEnd;
      if (styleEnd <= sStart) continue;
      requests.push({
        updateTextStyle: {
          range: { segmentId: headerId, startIndex: sStart, endIndex: styleEnd },
          textStyle: {
            bold: s.bold ?? false,
            fontSize: { magnitude: 10, unit: "PT" },
            weightedFontFamily: { fontFamily: FONT },
          },
          fields: "bold,fontSize,weightedFontFamily",
        },
      });
    }
  }

  // Zellrahmen weiß (unsichtbar) wie im Referenz-Doc.
  const whiteBorder = {
    color: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
    width: { magnitude: 1, unit: "PT" },
    dashStyle: "SOLID",
  };
  requests.push({
    updateTableCellStyle: {
      tableStartLocation: { segmentId: headerId, index: tableEl.startIndex },
      tableCellStyle: {
        borderLeft: whiteBorder,
        borderRight: whiteBorder,
        borderTop: whiteBorder,
        borderBottom: whiteBorder,
      },
      fields: "borderLeft,borderRight,borderTop,borderBottom",
    },
  });
  // Spaltenbreiten wie im Referenz-Doc (222 | 118.5 | Rest).
  requests.push({
    updateTableColumnProperties: {
      tableStartLocation: { segmentId: headerId, index: tableEl.startIndex },
      columnIndices: [0],
      tableColumnProperties: { widthType: "FIXED_WIDTH", width: { magnitude: 222, unit: "PT" } },
      fields: "widthType,width",
    },
  });
  requests.push({
    updateTableColumnProperties: {
      tableStartLocation: { segmentId: headerId, index: tableEl.startIndex },
      columnIndices: [1],
      tableColumnProperties: { widthType: "FIXED_WIDTH", width: { magnitude: 118.5, unit: "PT" } },
      fields: "widthType,width",
    },
  });
  return requests;
}

async function batchUpdate(
  connectors: ReplitConnectors,
  documentId: string,
  requests: object[],
): Promise<Response> {
  return connectors.proxy("google-docs", `/v1/documents/${documentId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
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

  // Schritt 1: Grundlayout + Kopf-/Fußzeile anlegen + Textinhalt schreiben.
  const baseRequests = [
    documentStyleRequest(),
    { createHeader: { type: "DEFAULT" } },
    { createFooter: { type: "DEFAULT" } },
  ];
  let updateRes = await batchUpdate(connectors, documentId, [...baseRequests, ...buildAkteDocRequests(data)]);
  if (!updateRes.ok && data.images.length > 0) {
    // Bild-Einbettung kann scheitern (z. B. zu groß / URL nicht abrufbar) —
    // dann ohne eingebettete Bilder erneut versuchen und sie nur auflisten.
    const fallback: AkteDocData = {
      ...data,
      images: [],
      otherFiles: [...data.images.map((i) => i.filename), ...data.otherFiles],
    };
    updateRes = await batchUpdate(connectors, documentId, [...baseRequests, ...buildAkteDocRequests(fallback)]);
  }
  if (!updateRes.ok) {
    const body = await updateRes.text();
    throw new Error(`Google Docs: Inhalt konnte nicht geschrieben werden (HTTP ${updateRes.status}): ${body.slice(0, 300)}`);
  }
  const updateBody = (await updateRes.json()) as {
    replies?: Array<{ createHeader?: { headerId: string }; createFooter?: { footerId: string } }>;
  };
  const headerId = updateBody.replies?.find((r) => r.createHeader)?.createHeader?.headerId;
  const footerId = updateBody.replies?.find((r) => r.createFooter)?.createFooter?.footerId;

  // Schritt 2: Kopf-/Fußzeilen-Inhalt (Titelzeilen + leere Tabelle).
  if (headerId || footerId) {
    const hfRequests = [
      ...(headerId ? buildHeaderRequests(headerId) : []),
      ...(footerId ? buildFooterRequests(footerId) : []),
    ];
    const hfRes = await batchUpdate(connectors, documentId, hfRequests);
    if (!hfRes.ok) {
      const body = await hfRes.text();
      throw new Error(`Google Docs: Kopfzeile konnte nicht geschrieben werden (HTTP ${hfRes.status}): ${body.slice(0, 300)}`);
    }
  }

  // Schritt 3: Tabellen-Zellen befüllen — dafür erst die Zell-Indizes aus dem
  // Dokument lesen (die Docs-API vergibt sie beim Einfügen der Tabelle).
  if (headerId) {
    const getRes = await connectors.proxy("google-docs", `/v1/documents/${documentId}`);
    if (getRes.ok) {
      const fullDoc = (await getRes.json()) as {
        headers?: Record<string, { content: DocsStructuralElement[] }>;
      };
      const headerContent = fullDoc.headers?.[headerId]?.content;
      if (headerContent) {
        const fillRequests = buildHeaderTableFillRequests(headerId, headerContent, data);
        if (fillRequests.length > 0) {
          const fillRes = await batchUpdate(connectors, documentId, fillRequests);
          if (!fillRes.ok) {
            const body = await fillRes.text();
            throw new Error(
              `Google Docs: Kopfzeilen-Tabelle konnte nicht befüllt werden (HTTP ${fillRes.status}): ${body.slice(0, 300)}`,
            );
          }
        }
      }
    }
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
