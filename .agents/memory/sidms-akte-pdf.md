---
name: SIDMS Akte-PDF / pdfkit im esbuild-Bundle
description: Warum pdfkit im api-server als external gebaut werden muss und wie der Akte-Download aufgebaut ist
---

## pdfkit im esbuild-Bundle

Regel: `pdfkit` muss in `artifacts/api-server/build.mjs` unter `external` stehen, und `@swc/helpers` muss als Dependency des api-servers installiert sein.

**Why:** Gebündelt wirft der Server beim Start `Cannot find module '@swc/helpers/cjs/_define_property.cjs'` (fontkit/brotli-Require) und zur Laufzeit `ENOENT .../dist/data/Helvetica.afm` — pdfkit liest seine .afm-Fontdateien relativ zum Paketverzeichnis von der Platte.

**How to apply:** Bei neuen Paketen mit Laufzeit-Dateizugriff relativ zum Paket (Fonts, .proto, Templates) direkt als external markieren statt Bundle-Fehler zu debuggen.

## Akte-Download

- `GET /api/cases/:id/akte` (cases.ts) nutzt `loadAccessibleCase` → gleiche Fall-Sichtbarkeitsregeln wie die Fallakte selbst.
- PDF-Layout in `lib/aktePdf.ts` nach dem Beispiel-Google-Doc des Users (DOJ/FIB-Kopf, Aktenzeichen, Sachbearbeiter "DN-xx | Name", Beschreibung, Verhandlungsführung, Details, Straftaten, Beweisbilder mit Captions, Fußnote "elektronisch erstellt...").
- Nur JPEG/PNG werden eingebettet (pdfkit-Limitierung); Caps: max. 20 Bilder / 60 MB pro PDF, Rest wird namentlich gelistet.
- Frontend lädt per plain fetch mit Bearer-Token (sessionStorage `sidms_token`), nicht über Orval-Hooks — Präzedenz wie Evidence-Endpoints.
