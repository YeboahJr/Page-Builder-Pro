// Erzeugt den Unterschriften-Stempel der Akte als PNG (Vorlage des Users):
// blaues FIB-Siegel als Wasserzeichen, darüber "Federal Investigation Bureau"
// in Fett, der Name in blauer Schreibschrift (Great Vibes) über dem Siegel,
// darunter Unterschriftslinie, Name und Rang. Für einen echten Stempel-Look
// wird alles in Stempeltinte (Blau) gehalten, mit unregelmäßiger Deckung und
// kleinen Fehlstellen (Ink-Textur) versehen und leicht gedreht. Die Docs-API
// kann keine frei positionierten/überlappenden Elemente einfügen, deshalb
// wird der komplette Stempel serverseitig als ein Bild gerendert.
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

const INK = "#000000";

export async function renderStampImage(opts: { name: string; rang: string | null }): Promise<Buffer> {
  ensureFont();
  // 2x-Auflösung für scharfe Darstellung im Dokument (entspricht ~410x320).
  const W = 820;
  const H = 640;

  // Stempel-Inhalt zunächst auf eine eigene Ebene zeichnen.
  const layer = createCanvas(W, H);
  const ctx = layer.getContext("2d");

  // Siegel-Wasserzeichen (bereits helles Blau mit Transparenz).
  const seal = await loadImage(Buffer.from(fibStampBlueB64, "base64"));
  const sealW = 470;
  const sealH = sealW * (seal.height / seal.width);
  // Siegel deutlich transparenter, damit die Schrift darüber klar lesbar ist.
  ctx.globalAlpha = 0.35;
  ctx.drawImage(seal, 100, 115, sealW, sealH);
  ctx.globalAlpha = 1;

  // Überschrift in Fett (überlappt den oberen Siegelrand wie in der Vorlage).
  ctx.fillStyle = INK;
  ctx.font = "bold 38px 'DejaVu Sans'";
  ctx.fillText("Federal Investigation Bureau", 110, 105);

  // Name in blauer Schreibschrift über dem Siegel; bei langen Namen wird die
  // Schriftgröße reduziert, damit der Name auf den Stempel passt.
  ctx.fillStyle = INK;
  let size = 96;
  ctx.font = `${size}px GreatVibes`;
  while (ctx.measureText(opts.name).width > 560 && size > 40) {
    size -= 4;
    ctx.font = `${size}px GreatVibes`;
  }
  ctx.fillText(opts.name, 130, 430);

  // Unterschriftslinie.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(110, 452);
  ctx.lineTo(660, 452);
  ctx.stroke();

  // Klartext-Name und Rang unter der Linie.
  ctx.fillStyle = INK;
  ctx.font = "bold 30px 'DejaVu Sans'";
  ctx.fillText(opts.name, 110, 495);
  if (opts.rang?.trim()) {
    ctx.fillText(opts.rang.trim(), 110, 535);
  }

  // Ink-Textur: zufällige kleine Fehlstellen und ungleichmäßige Deckung, wie
  // bei einem echten Stempelabdruck — dezent genug, dass alles lesbar bleibt.
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0) {
      const r = Math.random();
      if (r < 0.1) d[i + 3] = 0;
      else if (r < 0.35) d[i + 3] = Math.floor(d[i + 3] * (0.45 + Math.random() * 0.4));
    }
  }
  ctx.putImageData(id, 0, 0);

  // Leicht gedreht auf das (transparente) Endcanvas stempeln.
  const out = createCanvas(W, H);
  const octx = out.getContext("2d");
  octx.translate(W / 2, H / 2);
  octx.rotate((-3 * Math.PI) / 180);
  octx.globalAlpha = 0.92;
  octx.drawImage(layer, -W / 2, -H / 2);

  return out.encode("png");
}
