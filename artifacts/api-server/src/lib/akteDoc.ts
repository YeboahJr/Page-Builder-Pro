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
  // Signierte URLs für das Kopfzeilen-Siegel und den Unterschriften-Stempel
  // (null = ohne Bild, z. B. wenn Object Storage nicht verfügbar ist).
  sealUrl: string | null;
  stampUrl: string | null;
}

export interface AkteDocResult {
  documentId: string;
  url: string;
  exportUrl: string;
  title: string;
}

// Daten für den "Antrag auf Durchsuchungsbefehl" (Razzia-Antrag).
// Kopfzeile/Fußzeile identisch zur Akte; der Textkörper folgt der vom User
// vorgegebenen Antrags-Vorlage (Anschreiben an die Generalstaatsanwaltschaft).
export interface RazziaDocData {
  target: string;
  antragNumber: string;
  createdBy: string;
  createdByDienstnummer: string | null;
  createdByRank: string | null;
  createdAt: Date;
  // Angehängte (abgeschlossene) Akten in Auswahlreihenfolge.
  cases: Array<{ caseNumber: string; title: string; straftaten: string[] | null }>;
  sealUrl: string | null;
  stampUrl: string | null;
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

  image(uri: string, opts?: { widthPt?: number; align?: Align }) {
    // Ein Inline-Bild belegt einen Index; danach folgt eine neue Zeile.
    const start = this.idx;
    this.requests.push({
      insertInlineImage: {
        location: this.loc(start),
        uri,
        objectSize: {
          width: { magnitude: opts?.widthPt ?? 467, unit: "PT" },
        },
      },
    });
    this.idx += 1;
    this.empty();
    // Ausrichtung NACH empty() setzen: empty() stylt seinen (und damit auch
    // den Bild-)Absatz auf JUSTIFIED und würde die Ausrichtung überschreiben.
    if (opts?.align) {
      this.requests.push({
        updateParagraphStyle: {
          range: this.range(start, start + 1),
          paragraphStyle: { alignment: opts.align },
          fields: "alignment",
        },
      });
    }
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

  // Signatur: kompletter Stempel als vorgerendertes Bild (Siegel-Wasserzeichen
  // mit Schreibschrift-Name), da die Docs-API keine überlappenden Elemente kann.
  b.empty();
  if (data.stampUrl) {
    b.image(data.stampUrl, { widthPt: 230, align: "END" });
  } else {
    // Fallback ohne Stempelbild (z. B. wenn Object Storage nicht erreichbar ist).
    b.text("Federal Investigation Bureau", { bold: true, size: 12, align: "CENTER" });
    b.text(data.leadAgent, { italic: true, size: 14, align: "CENTER", color: { r: 0.12, g: 0.23, b: 0.58 } });
    const rangZeile = [
      data.leadAgentRank?.trim() || null,
      data.leadAgentDienstnummer ? `DN-${data.leadAgentDienstnummer}` : null,
    ].filter(Boolean).join(" | ");
    if (rangZeile) b.text(rangZeile, { align: "CENTER" });
  }

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

// Kopfzeilen-Gerüst: zwei Tabellen ans Segment-Ende anhängen —
// Tabelle 1 (1x2): links DOJ/FIB-Titelzeilen, rechts das FIB-Siegel;
// Tabelle 2 (1x3): Aktenzeichen | Sachbearbeiter | Datum.
// Die Zellen werden in einem Folgeschritt befüllt, weil die Zell-Indizes
// erst nach dem Einfügen der Tabellen bekannt sind.
function buildHeaderRequests(headerId: string): object[] {
  return [
    { insertTable: { rows: 1, columns: 2, endOfSegmentLocation: { segmentId: headerId } } },
    { insertTable: { rows: 1, columns: 3, endOfSegmentLocation: { segmentId: headerId } } },
  ];
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

// Weißer (unsichtbarer) Zellrahmen wie im Referenz-Doc.
const WHITE_BORDER = {
  color: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
  width: { magnitude: 1, unit: "PT" },
  dashStyle: "SOLID",
};

function whiteCellBordersRequest(headerId: string, tableStartIndex: number): object {
  return {
    updateTableCellStyle: {
      tableStartLocation: { segmentId: headerId, index: tableStartIndex },
      tableCellStyle: {
        borderLeft: WHITE_BORDER,
        borderRight: WHITE_BORDER,
        borderTop: WHITE_BORDER,
        borderBottom: WHITE_BORDER,
      },
      fields: "borderLeft,borderRight,borderTop,borderBottom",
    },
  };
}

function columnWidthRequest(headerId: string, tableStartIndex: number, column: number, widthPt: number): object {
  return {
    updateTableColumnProperties: {
      tableStartLocation: { segmentId: headerId, index: tableStartIndex },
      columnIndices: [column],
      tableColumnProperties: { widthType: "FIXED_WIDTH", width: { magnitude: widthPt, unit: "PT" } },
      fields: "widthType,width",
    },
  };
}

// Text-Spans in eine Tabellenzelle einfügen und stylen.
function fillCellRequests(headerId: string, insertAt: number, spans: Span[]): object[] {
  const requests: object[] = [];
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
          fontSize: { magnitude: s.size ?? 10, unit: "PT" },
          weightedFontFamily: { fontFamily: FONT },
        },
        fields: "bold,fontSize,weightedFontFamily",
      },
    });
  }
  return requests;
}

// Befüllt die Kopfzeilen-Tabellen (Titel + Siegel, Aktenzeichen-Zeile), zieht
// die Linien (unter "Federal Investigation Bureau" und am unteren Rand der
// Kopfzeile) und blendet alle Zellrahmen aus. Die Einfügungen erfolgen in
// absteigender Index-Reihenfolge, damit frühere Indizes durch spätere
// Einfügungen nicht verschoben werden.
// Nur die Felder, die die Kopfzeile wirklich braucht — so ist die Kopfzeile
// für Akte UND Razzia-Antrag wiederverwendbar.
interface HeaderData {
  caseNumber: string;
  leadAgent: string;
  leadAgentDienstnummer: string | null;
  createdAt: Date;
  sealUrl: string | null;
}

function buildHeaderTableFillRequests(
  headerId: string,
  headerContent: DocsStructuralElement[],
  data: HeaderData,
): object[] {
  const tables = headerContent.filter((el) => el.table);
  if (tables.length < 2) return [];
  const titleTable = tables[0];
  const infoTable = tables[1];
  const titleCells = titleTable.table!.tableRows[0]?.tableCells ?? [];
  const infoCells = infoTable.table!.tableRows[0]?.tableCells ?? [];
  if (titleCells.length < 2 || infoCells.length < 3) return [];

  const requests: object[] = [];

  // Untere Abschlusslinie der Kopfzeile: erster Absatz NACH der Info-Tabelle
  // bekommt eine untere Rahmenlinie (reine Style-Änderung, verschiebt nichts).
  const infoTableEnd = (infoTable as { endIndex?: number }).endIndex;
  const afterPara = headerContent.find(
    (el) => !el.table && infoTableEnd !== undefined && el.startIndex >= infoTableEnd,
  ) as ({ startIndex: number; endIndex?: number } | undefined);
  if (afterPara?.endIndex !== undefined) {
    requests.push({
      updateParagraphStyle: {
        range: { segmentId: headerId, startIndex: afterPara.startIndex, endIndex: afterPara.endIndex },
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
  }

  // --- Info-Tabelle (höhere Indizes zuerst befüllen) ---
  const sachbearbeiter = data.leadAgentDienstnummer
    ? `DN-${data.leadAgentDienstnummer} | ${data.leadAgent}`
    : data.leadAgent;
  const infoSpans: Span[][] = [
    [{ t: "Aktenzeichen:\n", bold: true }, { t: data.caseNumber }],
    [{ t: "Sachbearbeiter:\n", bold: true }, { t: sachbearbeiter }],
    [{ t: "Datum:\n", bold: true }, { t: formatDateDe(data.createdAt) }],
  ];
  for (let c = infoCells.length - 1; c >= 0; c--) {
    const spans = infoSpans[c];
    if (!spans) continue;
    requests.push(...fillCellRequests(headerId, infoCells[c].startIndex + 1, spans));
  }
  requests.push(whiteCellBordersRequest(headerId, infoTable.startIndex));
  requests.push(columnWidthRequest(headerId, infoTable.startIndex, 0, 222));
  requests.push(columnWidthRequest(headerId, infoTable.startIndex, 1, 118.5));

  // --- Titel-Tabelle: rechte Zelle (Siegel), dann linke Zelle (Titelzeilen) ---
  if (data.sealUrl) {
    const sealAt = titleCells[1].startIndex + 1;
    requests.push({
      insertInlineImage: {
        location: { segmentId: headerId, index: sealAt },
        uri: data.sealUrl,
        objectSize: { width: { magnitude: 68, unit: "PT" } },
      },
    });
    requests.push({
      updateParagraphStyle: {
        range: { segmentId: headerId, startIndex: sealAt, endIndex: sealAt + 1 },
        paragraphStyle: { alignment: "END" },
        fields: "alignment",
      },
    });
  }

  const titleAt = titleCells[0].startIndex + 1;
  const line1 = "U.S. Department of Justice\n";
  const line2 = "Federal Investigation Bureau";
  requests.push(
    ...fillCellRequests(headerId, titleAt, [
      { t: line1, size: 18 },
      { t: line2, size: 18, bold: true },
    ]),
  );
  // Linie unter "Federal Investigation Bureau" (wie in der Vorlage).
  const line2Start = titleAt + line1.length;
  requests.push({
    updateParagraphStyle: {
      range: { segmentId: headerId, startIndex: line2Start, endIndex: line2Start + line2.length + 1 },
      paragraphStyle: {
        borderBottom: {
          width: { magnitude: 2, unit: "PT" },
          padding: { magnitude: 2, unit: "PT" },
          dashStyle: "SOLID",
          color: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
        },
      },
      fields: "borderBottom",
    },
  });
  requests.push(whiteCellBordersRequest(headerId, titleTable.startIndex));
  requests.push(columnWidthRequest(headerId, titleTable.startIndex, 0, 380));
  requests.push(columnWidthRequest(headerId, titleTable.startIndex, 1, 87));

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

// Erstellt ein Google-Docs-Dokument mit FIB-Kopf-/Fußzeile, befüllt es und
// gibt es per Link frei ("Jeder mit dem Link kann ansehen"), damit
// Öffnen/Download ohne Google-Login des jeweiligen Beamten funktionieren.
async function createFibDoc(opts: {
  title: string;
  header: HeaderData;
  buildBody: () => object[];
  // Fallback-Body ohne eingebettete Bilder (z. B. wenn ein Bild nicht abrufbar ist).
  buildBodyFallback?: () => object[];
}): Promise<AkteDocResult> {
  // Client nie cachen — der Connector-Proxy kümmert sich um Token-Refresh.
  const connectors = new ReplitConnectors();

  const createRes = await connectors.proxy("google-docs", "/v1/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: opts.title }),
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
  let updateRes = await batchUpdate(connectors, documentId, [...baseRequests, ...opts.buildBody()]);
  if (!updateRes.ok && opts.buildBodyFallback) {
    // Bild-Einbettung kann scheitern (z. B. zu groß / URL nicht abrufbar) —
    // dann ohne eingebettete Bilder erneut versuchen und sie nur auflisten.
    updateRes = await batchUpdate(connectors, documentId, [...baseRequests, ...opts.buildBodyFallback()]);
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
    if (!getRes.ok) {
      throw new Error(`Google Docs: Dokument konnte nicht gelesen werden (HTTP ${getRes.status})`);
    }
    const fullDoc = (await getRes.json()) as {
      headers?: Record<string, { content: DocsStructuralElement[] }>;
    };
    const headerContent = fullDoc.headers?.[headerId]?.content;
    if (!headerContent) {
      throw new Error("Google Docs: Kopfzeilen-Inhalt fehlt im Dokument");
    }
    const fillRequests = buildHeaderTableFillRequests(headerId, headerContent, opts.header);
    if (fillRequests.length === 0) {
      throw new Error("Google Docs: Kopfzeilen-Tabellen wurden nicht wie erwartet angelegt");
    }
    const fillRes = await batchUpdate(connectors, documentId, fillRequests);
    if (!fillRes.ok) {
      const body = await fillRes.text();
      throw new Error(
        `Google Docs: Kopfzeilen-Tabelle konnte nicht befüllt werden (HTTP ${fillRes.status}): ${body.slice(0, 300)}`,
      );
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
    title: opts.title,
  };
}

export async function createAkteDoc(data: AkteDocData): Promise<AkteDocResult> {
  const fallback: AkteDocData = {
    ...data,
    images: [],
    otherFiles: [...data.images.map((i) => i.filename), ...data.otherFiles],
  };
  return createFibDoc({
    title: `Akte ${data.caseNumber} – ${data.title}`,
    header: {
      caseNumber: data.caseNumber,
      leadAgent: data.leadAgent,
      leadAgentDienstnummer: data.leadAgentDienstnummer,
      createdAt: data.createdAt,
      sealUrl: data.sealUrl,
    },
    buildBody: () => buildAkteDocRequests(data),
    buildBodyFallback: data.images.length > 0 ? () => buildAkteDocRequests(fallback) : undefined,
  });
}

// Textkörper des Razzia-Antrags nach der vom User vorgegebenen Vorlage:
// Anschreiben an die Generalstaatsanwaltschaft (Zielname fett), gesammelte
// Straftaten, Grußformel mit Stempel, danach pro angehängter Akte ein
// Abschnitt "Akte N:" mit deren Straftaten und Fallnummer-Referenz.
export function buildRazziaDocRequests(data: RazziaDocData): object[] {
  const b = new DocBuilder();
  const ziel = data.target.trim();

  b.empty();
  b.spans([{ t: "Antrag auf Durchsuchungsbefehl:\n", bold: true, size: 16 }, { t: ziel, bold: true, size: 16 }]);
  b.empty();

  b.text("Sehr geehrte Generalstaatsanwaltschaft,");
  b.spans([
    { t: "hiermit fordert das Federal Investigation Bureau einen Durchsuchungsbeschluss für " },
    { t: ziel, bold: true },
    { t: " an. Bei diesem Antrag geht es um die Erlaubnis, die Mitglieder sowie den Hauptsitz von " },
    { t: ziel, bold: true },
    { t: " zu durchsuchen und entsprechend bei Auffindung illegaler Gegenstände diese zu konfiszieren." },
  ]);
  b.text("Das Federal Investigation Bureau sieht eine Razzia aus folgenden Gründen als dringend notwendig an:");
  b.text("Wiederholungsgefahr, Verdunklungsgefahr, Fluchtgefahr zwecks Warnung von Komplizen und Gefährdung der allgemeinen Sicherheit.");
  b.spans([
    { t: ziel, bold: true },
    { t: " schreckt aktuell nicht davor zurück, gegen Gesetze des Staates San Andreas zu verstoßen. Im Wesentlichen wird vorgeworfen:" },
  ]);
  b.empty();

  // Gesammelte Straftaten aller angehängten Akten (ohne Duplikate).
  const alleStraftaten: string[] = [];
  for (const c of data.cases) {
    for (const s of c.straftaten ?? []) {
      const t = s.trim();
      if (t && !alleStraftaten.includes(t)) alleStraftaten.push(t);
    }
  }
  if (alleStraftaten.length > 0) {
    for (const s of alleStraftaten) b.spans(straftatSpans(s), { align: "START" });
    b.empty();
  }

  b.text("Die einzelnen Fallakten entnehmen Sie bitte dem Anhang.");
  b.text("Für Rückfragen stehen wir Ihnen gerne zur Verfügung.");
  b.empty();
  b.text("Mit freundlichen Grüßen");
  b.empty();
  if (data.stampUrl) {
    b.image(data.stampUrl, { widthPt: 230, align: "END" });
  } else {
    b.text("Federal Investigation Bureau", { bold: true, size: 12, align: "CENTER" });
    b.text(data.createdBy, { italic: true, size: 14, align: "CENTER", color: { r: 0.12, g: 0.23, b: 0.58 } });
    const rangZeile = [
      data.createdByRank?.trim() || null,
      data.createdByDienstnummer ? `DN-${data.createdByDienstnummer}` : null,
    ].filter(Boolean).join(" | ");
    if (rangZeile) b.text(rangZeile, { align: "CENTER" });
  }
  b.empty();

  // Anhang: pro Akte ein Abschnitt mit deren Straftaten + Fallnummer-Referenz.
  data.cases.forEach((c, i) => {
    b.separator();
    b.empty();
    b.spans([{ t: `Akte ${i + 1}: `, bold: true }, { t: c.title, bold: true }]);
    b.spans([{ t: "Aktenzeichen: ", bold: true }, { t: c.caseNumber }], { align: "START" });
    b.empty();
    const straftaten = (c.straftaten ?? []).map((s) => s.trim()).filter(Boolean);
    if (straftaten.length > 0) {
      b.text("Vorgeworfene Straftaten:", { bold: true, align: "START" });
      for (const s of straftaten) b.spans(straftatSpans(s), { align: "START" });
    } else {
      b.text("Keine Straftaten in der Akte hinterlegt.", { italic: true, align: "START" });
    }
    b.empty();
  });

  return b.requests;
}

export async function createRazziaDoc(data: RazziaDocData): Promise<AkteDocResult> {
  return createFibDoc({
    title: `Antrag auf Durchsuchungsbefehl: ${data.target.trim()}`,
    header: {
      caseNumber: data.antragNumber,
      leadAgent: data.createdBy,
      leadAgentDienstnummer: data.createdByDienstnummer,
      createdAt: data.createdAt,
      sealUrl: data.sealUrl,
    },
    buildBody: () => buildRazziaDocRequests(data),
  });
}
