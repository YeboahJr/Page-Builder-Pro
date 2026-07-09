import PDFDocument from "pdfkit";

// Data needed to render a case file ("Akte") as a PDF document that follows
// the user's Google-Doc template as closely as possible: DOJ/FIB letterhead
// with Aktenzeichen/Sachbearbeiter/Datum, plain black typography, sections
// with colon headings, horizontal rules, plain Straftaten lines, captions
// above the evidence images and the digital-signature footnote at the end.
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

const BLACK = "#000000";

function formatDateDe(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

export function buildAktePdf(data: AktePdfData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 64, left: 56, right: 56 } });

  const left = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // ---------- Letterhead: DOJ/FIB left, Aktenzeichen/Sachbearbeiter/Datum right ----------
  const headerTop = doc.y;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(BLACK)
    .text("U.S. Department of Justice", left, headerTop);
  doc.font("Helvetica").fontSize(11)
    .text("Federal Investigation Bureau", left, doc.y);

  const sachbearbeiter = data.leadAgentDienstnummer
    ? `DN-${data.leadAgentDienstnummer} | ${data.leadAgent}`
    : data.leadAgent;

  const metaWidth = 250;
  const metaX = doc.page.width - doc.page.margins.right - metaWidth;
  let metaY = headerTop;
  const metaRows: Array<[string, string]> = [
    ["Aktenzeichen:", data.caseNumber],
    ["Sachbearbeiter:", sachbearbeiter],
    ["Datum:", formatDateDe(data.createdAt)],
  ];
  for (const [label, value] of metaRows) {
    doc.font("Helvetica-Bold").fontSize(9).text(label, metaX, metaY, { width: metaWidth, align: "right" });
    metaY = doc.y;
    doc.font("Helvetica").fontSize(9).text(value, metaX, metaY, { width: metaWidth, align: "right" });
    metaY = doc.y + 2;
  }

  doc.x = left;
  doc.y = Math.max(doc.y, metaY) + 10;

  hr(doc);
  doc.moveDown(1.5);

  // ---------- Title ----------
  doc.font("Helvetica-Bold").fontSize(20).fillColor(BLACK).text(data.title, left, doc.y, { align: "center", width: pageWidth });
  doc.moveDown(1.5);

  const heading = (label: string) => {
    ensureSpace(doc, 50);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(BLACK).text(label, left, doc.y);
    doc.moveDown(0.4);
  };

  const bodyText = (text: string) => {
    doc.font("Helvetica").fontSize(11).fillColor(BLACK).text(text, left, doc.y, { width: pageWidth, lineGap: 2 });
    doc.moveDown(1);
  };

  // ---------- Beschreibung ----------
  if (data.description?.trim()) {
    heading("Beschreibung:");
    bodyText(data.description.trim());
  }

  // ---------- Verhandlungsführung ----------
  if (data.verhandlungsfuehrung?.trim()) {
    heading("Verhandlungsführung:");
    bodyText(data.verhandlungsfuehrung.trim());
  }

  // ---------- Details ----------
  const hasTatFacts = data.tatDatum || data.tatWann || data.tatWo || data.tatWer;
  if (data.details?.trim() || hasTatFacts) {
    ensureSpace(doc, 80);
    hr(doc);
    doc.moveDown(1);
    heading("Details:");
    if (data.details?.trim()) {
      doc.font("Helvetica").fontSize(11).fillColor(BLACK).text(data.details.trim(), left, doc.y, { width: pageWidth, lineGap: 2 });
      doc.moveDown(0.8);
    }
    const facts: Array<[string, string | null]> = [
      ["Datum:", data.tatDatum],
      ["Zeit:", data.tatWann],
      ["Wo:", data.tatWo],
      ["Wer:", data.tatWer],
    ];
    for (const [label, value] of facts) {
      if (!value?.trim()) continue;
      ensureSpace(doc, 16);
      const y = doc.y;
      doc.font("Helvetica").fontSize(11).fillColor(BLACK).text(label, left, y, { width: 90 });
      doc.font("Helvetica").fontSize(11).text(value.trim(), left + 90, y, { width: pageWidth - 90 });
      doc.moveDown(0.15);
    }
    doc.x = left;
    doc.moveDown(1);
  }

  // ---------- Vorgeworfene Straftaten ----------
  if ((data.straftaten?.length ?? 0) > 0) {
    heading("Vorgeworfene Straftaten:");
    for (const s of data.straftaten!) {
      ensureSpace(doc, 16);
      doc.font("Helvetica").fontSize(11).fillColor(BLACK).text(s, left, doc.y, { width: pageWidth, lineGap: 1 });
    }
    doc.moveDown(1);
  }

  // ---------- Bilder (caption above image, like the template) ----------
  if (data.images.length > 0) {
    let imgIndex = 0;
    for (const img of data.images) {
      imgIndex += 1;
      const renderedHeight = imageDisplayHeight(img.data, pageWidth, 320);
      const caption = `Bild ${imgIndex}: ${img.filename}`;
      doc.font("Helvetica").fontSize(11);
      const captionHeight = doc.heightOfString(caption, { width: pageWidth, lineGap: 1 });
      // Reserve caption + image together so they stay on the same page.
      ensureSpace(doc, captionHeight + renderedHeight + 20);
      doc.fillColor(BLACK)
        .text(caption, left, doc.y, { width: pageWidth, lineGap: 1 });
      doc.moveDown(0.4);
      try {
        doc.image(img.data, left, doc.y, { fit: [pageWidth, 320] });
        // pdfkit does not advance y past a fitted image reliably; compute manually.
        doc.y = doc.y + renderedHeight;
      } catch {
        doc.font("Helvetica-Oblique").fontSize(10).text("(Bild konnte nicht eingebettet werden)", left, doc.y);
      }
      doc.moveDown(1);
    }
  }

  if (data.otherFiles.length > 0) {
    ensureSpace(doc, 40);
    heading("Weitere Anhänge:");
    for (const f of data.otherFiles) {
      ensureSpace(doc, 14);
      doc.font("Helvetica").fontSize(10).fillColor(BLACK).text(f, left, doc.y);
    }
    doc.moveDown(1);
  }

  // ---------- Footer note ----------
  ensureSpace(doc, 60);
  doc.moveDown(1);
  hr(doc);
  doc.moveDown(0.6);
  doc.font("Helvetica").fontSize(10).fillColor(BLACK)
    .text("Dieses Dokument wurde elektronisch erstellt und ist auch mit digitaler Unterschrift gültig.", left, doc.y, { width: pageWidth });

  doc.end();
  return doc;
}

// Plain horizontal rule across the content width, like the template's
// "________________" separators.
function hr(doc: PDFKit.PDFDocument) {
  doc.moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .lineWidth(1).strokeColor(BLACK).stroke();
}

// Starts a new page when fewer than `needed` points remain below the cursor.
function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
    doc.x = doc.page.margins.left;
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
