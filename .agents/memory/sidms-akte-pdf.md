---
name: SIDMS Akte als Google Doc
description: Fallakte wird als Google-Docs-Dokument erstellt (nicht mehr PDF) — Connector-Setup, Freigabe-Modell, API-Fallen und Test-Rezept.
---

# Akte = Google Doc (seit Juli 2026, ersetzt PDF)

Die frühere PDF-Generierung (pdfkit) wurde komplett entfernt. `GET /api/cases/:id/akte` erstellt pro Aufruf ein neues Google-Docs-Dokument und liefert JSON (`documentId`, `url`, `exportUrl`, `title`).

**Why:** Expliziter Nutzerwunsch — Akten sollen als Google Docs entstehen, mit „Öffnen"-Button neben dem Download.

**Nicht code-offensichtliche Punkte:**
- Es sind ZWEI Replit-Connectors nötig: `google-docs` (Dokument erstellen/befüllen) und `google-drive` (Link-Freigabe `anyone`/`reader`). Der Docs-Proxy erreicht die Drive-API nicht — anderer API-Host, Freigabe über den Docs-Connector schlägt fehl.
- Dokumente werden bewusst als „jeder mit Link kann ansehen" freigegeben, damit Beamte ohne Google-Login öffnen/herunterladen können — operativ sensible, gewollte Entscheidung.
- Download läuft clientseitig über `https://docs.google.com/document/d/{id}/export?format=docx` — funktioniert dank Link-Freigabe ohne API und ohne Login.
- Docs-API-Falle: `updateTextStyle` mit leerer Range (Leerzeilen) → HTTP 400 „The range should not be empty". Leerzeilen dürfen nur Paragraph-Style bekommen.
- Beweisbilder werden über kurzlebig signierte GCS-URLs (`signObjectURL`, 900 s) per `insertInlineImage` eingebettet; scheitert das batchUpdate, Fallback ohne Bilder (nur namentliche Auflistung).

**Test-Rezept:** Login `POST /api/auth/login` mit Body-Feldern `dienstnummer`/`passwort` (NICHT username/password); Dev-Seed-Admin-Zugangsdaten stehen im Seed-Skript. Case anlegen → `GET /api/cases/$ID/akte` → JSON prüfen; Inhalt via `export?format=docx` laden und `word/document.xml` aus dem ZIP greppen. Danach Case löschen.
