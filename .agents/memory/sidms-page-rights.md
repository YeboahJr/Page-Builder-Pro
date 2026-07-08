---
name: SIDMS Seitenrechte
description: Konvention für per-Officer Seitenrechte (allowedPages) und deren Grenzen
---

# Seitenrechte (allowedPages)

Regel: `officers.allowedPages` (text[], nullable) — `null` bedeutet "alle Seiten erlaubt".
Gültige Seiten-Keys: `dashboard`, `leitstelle`, `fallmanagement`, `personal`, `archiv`
(Backend-Validierung via `parseAllowedPages`, Frontend-Definitionen mit Labels in der sidms-App).
Leitungsränge sehen immer alle Seiten, unabhängig von allowedPages.

**Why:** Bestehende Officer sollten bei Einführung des Features vollen Zugriff behalten,
ohne Backfill — null=alles ist rückwärtskompatibel. Leitung darf nie ausgesperrt werden.

**How to apply:** Neue Sidebar-Seiten brauchen einen neuen Key an beiden Stellen
(api-server lib/pages.ts + sidms lib/pages.ts — bewusst dupliziert, kein Shared-Lib).
Wichtig: Seitenrechte sind bisher nur UI-Gating; Daten-API-Routen sind NICHT danach
gefiltert (nur Leitungs-Checks). Rechteänderungen greifen ohne Re-Login, weil der
AuthContext den Officer über /auth/me nachlädt.
