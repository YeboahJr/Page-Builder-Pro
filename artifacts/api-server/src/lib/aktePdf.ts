import PDFDocument from "pdfkit";
import fibEmblem from "../assets/fib-emblem-gray.png";
import fibStampBlue from "../assets/fib-stamp-blue.png";
import fibBadgeColor from "../assets/fib-badge-color.png";
import signatureFont from "../assets/signature-font.ttf";

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
  leadAgentRank: string | null;
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
  images: Array<{ filename: string; description: string | null; data: Buffer }>;
  otherFiles: string[];
}

const BLACK = "#000000";

function formatDateDe(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

// Vertical start of the letterhead and the fixed top margin that reserves
// room for it on every page. The letterhead is drawn inside this margin area.
const HEADER_TOP = 36;
const CONTENT_TOP = 190;

// Draws the DOJ/FIB letterhead (per template screenshot) at the top of the
// current page: titles left, FIB emblem top-right, thin rule between the two
// title lines, then a three-column meta row (Aktenzeichen / Sachbearbeiter /
// Datum), then a full rule. Restores the text cursor to the content area.
function drawLetterhead(doc: PDFKit.PDFDocument, data: AktePdfData) {
  const left = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Preserve the flowing text state (font/size) so a page break in the middle
  // of body text continues with the same style afterwards.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDoc = doc as any;
  const prevFont = anyDoc._font;
  const prevFontSize = anyDoc._fontSize;
  const prevX = doc.x;

  const emblemSize = 72;
  const emblemX = doc.page.width - doc.page.margins.right - emblemSize;
  try {
    doc.image(Buffer.from(fibEmblem, "base64"), emblemX, HEADER_TOP, { fit: [emblemSize, emblemSize] });
  } catch {
    // Emblem is decorative; the PDF is still valid without it.
  }

  doc.font("Helvetica").fontSize(18).fillColor(BLACK)
    .text("U.S. Department of Justice", left, HEADER_TOP + 8, { width: pageWidth - emblemSize - 12, lineBreak: false });
  // Thin rule between the two title lines, running toward the emblem.
  const midY = doc.y + 3;
  doc.moveTo(left, midY).lineTo(emblemX - 8, midY).lineWidth(0.7).strokeColor(BLACK).stroke();
  doc.font("Helvetica-Bold").fontSize(18)
    .text("Federal Investigation Bureau", left, midY + 4, { width: pageWidth - emblemSize - 12, lineBreak: false });

  const sachbearbeiter = data.leadAgentDienstnummer
    ? `DN-${data.leadAgentDienstnummer} | ${data.leadAgent}`
    : data.leadAgent;

  // Three meta columns under the titles. Values are hard-capped in height
  // (max ~2 lines, then ellipsis) so the letterhead can never overflow the
  // reserved top margin — an overflow inside the pageAdded handler would
  // otherwise trigger recursive page creation.
  const metaValueMaxHeight = 26;
  const metaTop = Math.max(doc.y + 14, HEADER_TOP + emblemSize + 10);
  const cols: Array<{ label: string; value: string; x: number; width: number }> = [
    { label: "Aktenzeichen:", value: data.caseNumber, x: left, width: 235 },
    { label: "Sachbearbeiter:", value: sachbearbeiter, x: left + 245, width: 130 },
    { label: "Datum:", value: formatDateDe(data.createdAt), x: left + 385, width: pageWidth - 385 },
  ];
  let metaBottom = metaTop;
  for (const col of cols) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(BLACK)
      .text(col.label, col.x, metaTop, { width: col.width, lineBreak: false });
    doc.font("Helvetica").fontSize(10)
      .text(col.value, col.x, metaTop + 13, { width: col.width, height: metaValueMaxHeight, ellipsis: true });
    metaBottom = Math.max(metaBottom, Math.min(doc.y, metaTop + 13 + metaValueMaxHeight));
  }

  const ruleY = Math.max(metaBottom + 12, CONTENT_TOP - 18);
  doc.moveTo(left, ruleY)
    .lineTo(doc.page.width - doc.page.margins.right, ruleY)
    .lineWidth(1).strokeColor(BLACK).stroke();

  // Restore flowing text state and place the cursor at the content start.
  if (prevFont) anyDoc._font = prevFont;
  if (prevFontSize) anyDoc._fontSize = prevFontSize;
  doc.fillColor(BLACK);
  doc.x = prevX;
  doc.y = doc.page.margins.top;
}

export function buildAktePdf(data: AktePdfData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margins: { top: CONTENT_TOP, bottom: 64, left: 56, right: 56 } });

  const left = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Letterhead on every page — for the first page directly, and via the
  // pageAdded hook for both manual and automatic page breaks. The reentrancy
  // guard makes sure the handler can never recurse into itself even if the
  // letterhead drawing ever caused a page break.
  let inLetterhead = false;
  const renderLetterhead = () => {
    if (inLetterhead) return;
    inLetterhead = true;
    try {
      drawLetterhead(doc, data);
    } finally {
      inLetterhead = false;
    }
  };
  renderLetterhead();
  doc.on("pageAdded", renderLetterhead);

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

  // ---------- Seite 1: Beschreibung ----------
  if (data.description?.trim()) {
    heading("Beschreibung:");
    bodyText(data.description.trim());
  }

  // ---------- Verhandlungsführung (gehört inhaltlich zur Beschreibung) ----------
  if (data.verhandlungsfuehrung?.trim()) {
    heading("Verhandlungsführung:");
    bodyText(data.verhandlungsfuehrung.trim());
  }

  // ---------- Seite 2: Details & Vorgeworfene Straftaten ----------
  const hasTatFacts = data.tatDatum || data.tatWann || data.tatWo || data.tatWer;
  const hasStraftaten = (data.straftaten?.length ?? 0) > 0;
  if (data.details?.trim() || hasTatFacts || hasStraftaten) {
    doc.addPage();
  }
  if (data.details?.trim() || hasTatFacts) {
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

  // ---------- Vorgeworfene Straftaten (ebenfalls Seite 2) ----------
  if (hasStraftaten) {
    heading("Vorgeworfene Straftaten:");
    for (const s of data.straftaten!) {
      ensureSpace(doc, 16);
      doc.font("Helvetica").fontSize(11).fillColor(BLACK).text(s, left, doc.y, { width: pageWidth, lineGap: 1 });
    }
    doc.moveDown(1);
  }

  // ---------- Ab Seite 3: Beweismittel (Bildbeschreibung unter dem Bild) ----------
  if (data.images.length > 0 || data.otherFiles.length > 0) {
    doc.addPage();
    heading("Beweismittel:");
  }
  if (data.images.length > 0) {
    let imgIndex = 0;
    for (const img of data.images) {
      imgIndex += 1;
      const renderedHeight = imageDisplayHeight(img.data, pageWidth, 320);
      const caption = `Bild ${imgIndex}: ${img.description || img.filename}`;
      doc.font("Helvetica").fontSize(11);
      const captionHeight = doc.heightOfString(caption, { width: pageWidth, lineGap: 1 });
      // Reserve image + caption together so they stay on the same page.
      ensureSpace(doc, captionHeight + renderedHeight + 20);
      try {
        doc.image(img.data, left, doc.y, { fit: [pageWidth, 320] });
        // pdfkit does not advance y past a fitted image reliably; compute manually.
        doc.y = doc.y + renderedHeight;
      } catch {
        doc.font("Helvetica-Oblique").fontSize(10).text("(Bild konnte nicht eingebettet werden)", left, doc.y);
      }
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(11).fillColor(BLACK)
        .text(caption, left, doc.y, { width: pageWidth, lineGap: 1 });
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

  // ---------- Signature stamp block (per template screenshot): centered bold
  // "Federal Investigation Bureau" heading, translucent blue FIB stamp left,
  // cursive signature over a rule with name + rank/dienstnummer beneath in the
  // middle, colored FIB badge right. Personalized to the Sachbearbeiter. ----------
  const stampBlockHeight = 160;
  ensureSpace(doc, stampBlockHeight + 40);
  doc.moveDown(1.5);
  const blockTop = doc.y;
  doc.font("Helvetica-Bold").fontSize(13).fillColor(BLACK)
    .text("Federal Investigation Bureau", left, blockTop, { width: pageWidth, align: "center" });

  const rowTop = doc.y + 6;
  try {
    doc.image(Buffer.from(fibStampBlue, "base64"), left + 4, rowTop - 6, { fit: [125, 125] });
  } catch {
    // Stamp is decorative; the PDF is still valid without it.
  }
  try {
    doc.image(Buffer.from(fibBadgeColor, "base64"), left + pageWidth - 105, rowTop, { fit: [100, 100] });
  } catch {
    // Badge is decorative; the PDF is still valid without it.
  }

  const sigWidth = 210;
  const sigX = left + (pageWidth - sigWidth) / 2;
  let hasScriptFont = false;
  try {
    doc.registerFont("Signature", Buffer.from(signatureFont, "base64"));
    hasScriptFont = true;
  } catch {
    // Fall back to italic if the script font cannot be loaded.
  }
  if (hasScriptFont) {
    doc.font("Signature").fontSize(30);
  } else {
    doc.font("Helvetica-Oblique").fontSize(20);
  }
  // Height-capped with ellipsis: a runaway name must never push the signature
  // block across page boundaries.
  doc.fillColor("#1f3a93").text(data.leadAgent, sigX, rowTop + 28, { width: sigWidth, align: "center", height: 40, ellipsis: true });

  const sigLineY = Math.min(doc.y, rowTop + 28 + 40) + 2;
  doc.moveTo(sigX, sigLineY).lineTo(sigX + sigWidth, sigLineY).lineWidth(0.8).strokeColor(BLACK).stroke();
  doc.font("Helvetica").fontSize(11).fillColor(BLACK)
    .text(data.leadAgent, sigX, sigLineY + 5, { width: sigWidth, height: 28, ellipsis: true });
  const rangZeile = [
    data.leadAgentRank?.trim() || null,
    data.leadAgentDienstnummer ? `DN-${data.leadAgentDienstnummer}` : null,
  ].filter(Boolean).join(" | ");
  if (rangZeile) {
    doc.text(rangZeile, sigX, Math.min(doc.y, sigLineY + 5 + 28), { width: sigWidth, height: 28, ellipsis: true });
  }

  doc.x = left;
  doc.y = Math.max(doc.y, rowTop + 125);

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
