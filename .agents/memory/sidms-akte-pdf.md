---
name: SIDMS Akte-PDF / pdfkit im esbuild-Bundle
description: Warum pdfkit im api-server als external gebaut werden muss und wie der Akte-Download aufgebaut ist
---

## pdfkit im esbuild-Bundle

Regel: `pdfkit` muss in `artifacts/api-server/build.mjs` unter `external` stehen, und `@swc/helpers` muss als Dependency des api-servers installiert sein.

**Why:** Gebündelt wirft der Server beim Start `Cannot find module '@swc/helpers/cjs/_define_property.cjs'` (fontkit/brotli-Require) und zur Laufzeit `ENOENT .../dist/data/Helvetica.afm` — pdfkit liest seine .afm-Fontdateien relativ zum Paketverzeichnis von der Platte.

**How to apply:** Bei neuen Paketen mit Laufzeit-Dateizugriff relativ zum Paket (Fonts, .proto, Templates) direkt als external markieren statt Bundle-Fehler zu debuggen.

## esbuild-Loader für Binärassets

Regel: Für eingebettete Binärdateien (PNG etc.) im api-server-Bundle den esbuild-Loader `base64` verwenden und mit `Buffer.from(x, "base64")` dekodieren — NICHT den `binary`-Loader.

**Why:** Der `binary`-Loader erzeugt `Uint8Array.fromBase64(...)`, das Node 24 nicht kennt → Server crasht beim Start mit `TypeError: Uint8Array.fromBase64 is not a function`.

**How to apply:** Gilt solange Node < 25 läuft; Ambient-Deklaration `declare module "*.png" { const s: string; export default s }` passend zum base64-Loader halten.

## Briefkopf auf jeder Seite (pageAdded-Muster)

Regel: Der DOJ/FIB-Briefkopf wird per `doc.on("pageAdded", ...)` auf jeder Seite gezeichnet (Platz reserviert über hohen `margins.top`). Jeder Text im Handler oder in fest positionierten Blöcken (Briefkopf, Signatur-Stempel) MUSS höhenbegrenzt sein (`height` + `ellipsis` bzw. `lineBreak: false`).

**Why:** Freitext-Felder (caseNumber, leadAgent) sind serverseitig unbegrenzt. Ohne Kappung löst der Briefkopf im Handler selbst Seitenumbrüche aus → `pageAdded` feuert erneut → rekursive Seitenerzeugung (DoS). Zusätzlich Reentrancy-Guard um den Handler. Ein ungekappter Name im Signatur-Block erzeugte real 18 Seiten.

**How to apply:** Neue Header-/Stempel-Texte immer mit `height`/`ellipsis` kappen; Regressionstest mit absichtlich langen Headerwerten (begrenzte Seitenzahl) muss grün bleiben. Vitest braucht dafür einen base64-Asset-Loader in `vitest.config.ts` (spiegelt den esbuild-Loader). pdfkit-Interna `_font`/`_fontSize` werden im Handler gesichert/wiederhergestellt, damit fließender Text nach Umbruch seinen Stil behält — bei pdfkit-Upgrade prüfen.

## Akte-Download

- `GET /api/cases/:id/akte` (cases.ts) nutzt `loadAccessibleCase` → gleiche Fall-Sichtbarkeitsregeln wie die Fallakte selbst.
- PDF-Layout in `lib/aktePdf.ts` nach dem Beispiel-Google-Doc des Users (DOJ/FIB-Kopf, Aktenzeichen, Sachbearbeiter "DN-xx | Name", Beschreibung, Verhandlungsführung, Details, Straftaten, Beweisbilder mit Captions, Fußnote "elektronisch erstellt...").
- Nur JPEG/PNG werden eingebettet (pdfkit-Limitierung); Caps: max. 20 Bilder / 60 MB pro PDF, Rest wird namentlich gelistet.
- Frontend lädt per plain fetch mit Bearer-Token (sessionStorage `sidms_token`), nicht über Orval-Hooks — Präzedenz wie Evidence-Endpoints.
