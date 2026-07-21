// Erzeugt den Unterschriften-Stempel der Akte als PNG (Vorlage des Users):
// blaues FIB-Siegel als Wasserzeichen, darüber "Federal Investigation Bureau"
// in Fett, der Name in blauer Schreibschrift (Great Vibes) über dem Siegel,
// darunter Unterschriftslinie, Name und Rang. Die Docs-API kann keine frei
// positionierten/überlappenden Elemente einfügen, deshalb wird der komplette
// Stempel serverseitig als ein Bild gerendert.
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import signatureFontB64 from "../assets/signature-font.ttf";
import fibStampBlueB64 from "../assets/fib-stamp-blue-transparent.png";

let fontRegistered = false;
function ensureFont(): void {
  if (!fontRegistered) {
    GlobalFonts.register(Buffer.from(signatureFontB64, "base64"), "GreatVibes");
    fontRegistered = true;
  }
}

export async function renderStampImage(opts: { name: string; rang: string | null }): Promise<Buffer> {
  ensureFont();
  // 2x-Auflösung für scharfe Darstellung im Dokument (entspricht ~410x320).
  const W = 820;
  const H = 640;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Siegel-Wasserzeichen (bereits helles Blau mit Transparenz).
  const seal = await loadImage(Buffer.from(fibStampBlueB64, "base64"));
  const sealW = 470;
  const sealH = sealW * (seal.height / seal.width);
  ctx.drawImage(seal, 100, 115, sealW, sealH);

  // Überschrift in Fett (überlappt den oberen Siegelrand wie in der Vorlage).
  ctx.fillStyle = "#000000";
  ctx.font = "bold 38px 'DejaVu Sans'";
  ctx.fillText("Federal Investigation Bureau", 110, 105);

  // Name in blauer Schreibschrift über dem Siegel; bei langen Namen wird die
  // Schriftgröße reduziert, damit der Name auf den Stempel passt.
  ctx.fillStyle = "#5a6bc7";
  let size = 96;
  ctx.font = `${size}px GreatVibes`;
  while (ctx.measureText(opts.name).width > 560 && size > 40) {
    size -= 4;
    ctx.font = `${size}px GreatVibes`;
  }
  ctx.fillText(opts.name, 130, 430);

  // Unterschriftslinie.
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(110, 452);
  ctx.lineTo(660, 452);
  ctx.stroke();

  // Klartext-Name und Rang unter der Linie.
  ctx.fillStyle = "#000000";
  ctx.font = "30px 'DejaVu Sans'";
  ctx.fillText(opts.name, 110, 495);
  if (opts.rang?.trim()) {
    ctx.fillText(opts.rang.trim(), 110, 535);
  }

  return canvas.encode("png");
}
