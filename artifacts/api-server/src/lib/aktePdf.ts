import PDFDocument from "pdfkit";

// Data needed to render a case file ("Akte") as a PDF document modeled after
// the FIB paper template (DOJ header, Aktenzeichen, Sachbearbeiter, sections).
export interface AktePdfData {
  caseNumber: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  leadAgent: string;
  leadAgentDienstnummer: string | null;
  description: string | null;
  details: string | null;
  verhandlungsfuehrung: string | null;
  straftaten: string[] | null;
  tatDatum: string | null;
  tatWann: string | null;
  tatWo: string | null;
  tatWer: string | null;
  createdAt: Date;
  agents: Array<{ name: string; role: string }>;
  images: Array<{ filename: string; data: Buffer }>;
  otherFiles: string[];
}

const NAVY = "#0b1f3a";
const GOLD = "#8a6d1d";
const GRAY = "#444444";
const LIGHT = "#777777";

function formatDateDe(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

export function buildAktePdf(data: AktePdfData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 64, left: 56, right: 56 } });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // ---------- Header (DOJ / FIB) ----------
  doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY).text("U.S. Department of Justice");
  doc.font("Helvetica").fontSize(10).fillColor(NAVY).text("Federal Investigation Bureau");
  doc.moveDown(0.8);

  const sachbearbeiter = data.leadAgentDienstnummer
    ? `DN-${data.leadAgentDienstnummer} | ${data.leadAgent}`
    : data.leadAgent;

  const metaRows: Array<[string, string]> = [
    ["Aktenzeichen:", data.caseNumber],
    ["Sachbearbeiter:", sachbearbeiter],
    ["Datum:", formatDateDe(data.createdAt)],
  ];
  for (const [label, value] of metaRows) {
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text(label, doc.page.margins.left, y, { width: 110 });
    doc.font("Helvetica").fontSize(9).fillColor("#000000").text(value, doc.page.margins.left + 110, y, { width: pageWidth - 110 });
    doc.moveDown(0.2);
  }

  doc.moveDown(0.6);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .lineWidth(1.2).strokeColor(NAVY).stroke();
  doc.moveDown(1);

  // ---------- Title ----------
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#000000").text(data.title, { align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor(LIGHT)
    .text(`Kategorie: ${data.category}   ·   Priorität: ${data.priority}   ·   Status: ${data.status}`, { align: "center" });
  doc.moveDown(1.2);

  const section = (heading: string) => {
    ensureSpace(doc, 60);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY).text(heading);
    doc.moveTo(doc.page.margins.left, doc.y + 1).lineTo(doc.page.margins.left + 120, doc.y + 1)
      .lineWidth(0.8).strokeColor(GOLD).stroke();
    doc.moveDown(0.5);
  };

  const bodyText = (text: string) => {
    doc.font("Helvetica").fontSize(10).fillColor("#111111").text(text, { lineGap: 2 });
    doc.moveDown(0.8);
  };

  // ---------- Beschreibung ----------
  if (data.description?.trim()) {
    section("Beschreibung");
    bodyText(data.description.trim());
  }

  // ---------- Verhandlungsführung ----------
  if (data.verhandlungsfuehrung?.trim()) {
    section("Verhandlungsführung");
    bodyText(data.verhandlungsfuehrung.trim());
  }

  // ---------- Details ----------
  const hasTatFacts = data.tatDatum || data.tatWann || data.tatWo || data.tatWer;
  if (data.details?.trim() || hasTatFacts) {
    section("Details");
    if (data.details?.trim()) bodyText(data.details.trim());
    const facts: Array<[string, string | null]> = [
      ["Datum:", data.tatDatum],
      ["Zeit:", data.tatWann],
      ["Wo:", data.tatWo],
      ["Wer:", data.tatWer],
    ];
    for (const [label, value] of facts) {
      if (!value?.trim()) continue;
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY).text(label, doc.page.margins.left, y, { width: 80 });
      doc.font("Helvetica").fontSize(10).fillColor("#111111").text(value.trim(), doc.page.margins.left + 80, y, { width: pageWidth - 80 });
      doc.moveDown(0.15);
    }
    doc.x = doc.page.margins.left;
    doc.moveDown(0.8);
  }

  // ---------- Vorgeworfene Straftaten ----------
  if ((data.straftaten?.length ?? 0) > 0) {
    section("Vorgeworfene Straftaten");
    for (const s of data.straftaten!) {
      ensureSpace(doc, 16);
      doc.font("Helvetica").fontSize(10).fillColor("#111111").text(`•  ${s}`, { lineGap: 1 });
    }
    doc.moveDown(0.8);
  }

  // ---------- Beteiligte Agenten ----------
  section("Beteiligte Agenten");
  const leadLine = data.leadAgentDienstnummer
    ? `${data.leadAgent} (DN-${data.leadAgentDienstnummer})`
    : data.leadAgent;
  doc.font("Helvetica").fontSize(10).fillColor("#111111").text(`Leitender Agent: ${leadLine}`);
  for (const a of data.agents) {
    if (a.name === data.leadAgent && a.role === "Leitender Agent") continue;
    ensureSpace(doc, 16);
    doc.font("Helvetica").fontSize(10).fillColor("#111111").text(`${a.role}: ${a.name}`);
  }
  doc.moveDown(0.8);

  // ---------- Beweismittel ----------
  if (data.images.length > 0 || data.otherFiles.length > 0) {
    section("Beweismittel");
    let imgIndex = 0;
    for (const img of data.images) {
      imgIndex += 1;
      // Reserve the actual rendered height plus caption so an image never
      // gets clipped at the page bottom.
      const renderedHeight = imageDisplayHeight(img.data, pageWidth, 300);
      ensureSpace(doc, renderedHeight + 30);
      try {
        doc.image(img.data, doc.page.margins.left, doc.y, {
          fit: [pageWidth, 300],
        });
        // pdfkit does not advance y past a fitted image reliably; compute manually.
        doc.y = doc.y + renderedHeight + 6;
        doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(LIGHT)
          .text(`Bild ${imgIndex}: ${img.filename}`, { lineGap: 1 });
        doc.moveDown(0.8);
      } catch {
        doc.font("Helvetica").fontSize(9).fillColor(LIGHT).text(`Bild ${imgIndex}: ${img.filename} (konnte nicht eingebettet werden)`);
        doc.moveDown(0.4);
      }
    }
    if (data.otherFiles.length > 0) {
      ensureSpace(doc, 40);
      doc.font("Helvetica").fontSize(9).fillColor(GRAY).text("Weitere Dateien (nicht eingebettet):");
      for (const f of data.otherFiles) {
        ensureSpace(doc, 14);
        doc.font("Helvetica").fontSize(9).fillColor(LIGHT).text(`•  ${f}`);
      }
      doc.moveDown(0.8);
    }
  }

  // ---------- Footer note ----------
  ensureSpace(doc, 60);
  doc.moveDown(1);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .lineWidth(0.8).strokeColor("#bbbbbb").stroke();
  doc.moveDown(0.5);
  doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(LIGHT)
    .text("Dieses Dokument wurde elektronisch erstellt und ist auch mit digitaler Unterschrift gültig.");

  doc.end();
  return doc;
}

// Starts a new page when fewer than `needed` points remain below the cursor.
function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

// Reads PNG/JPEG dimensions from the buffer to compute the rendered height of
// an image fitted into a box (pdfkit's `fit` preserves aspect ratio).
function imageDisplayHeight(data: Buffer, maxWidth: number, maxHeight: number): number {
  const dims = readImageSize(data);
  if (!dims) return maxHeight;
  const scale = Math.min(maxWidth / dims.width, maxHeight / dims.height, 1);
  return dims.height * scale;
}

function readImageSize(data: Buffer): { width: number; height: number } | null {
  // PNG: bytes 16..24 hold width/height in the IHDR chunk.
  if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  // JPEG: scan segments for SOFn markers.
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) { offset += 1; continue; }
      const marker = data[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
      }
      const len = data.readUInt16BE(offset + 2);
      offset += 2 + len;
    }
  }
  return null;
}
