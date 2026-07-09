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
Rechteänderungen greifen ohne Re-Login, weil der AuthContext den Officer über /auth/me nachlädt.

## Serverseitige Durchsetzung

Daten-API-Routen sind per `requirePages(...keys)`-Middleware (api-server) nach Seitenrechten
gefiltert: 401 ohne Login, 403 ohne passendes Seitenrecht; Leitung und allowedPages=null
passieren immer. Mapping (mehrere Keys = "eine der Seiten reicht"):
- `/dashboard` → dashboard; `/reports` + `/patrols` → leitstelle; `/evidence` → fallmanagement;
  `/idchanges` → personal; `/cases` → dashboard|fallmanagement|archiv (Fall-Involvement-Checks
  bleiben zusätzlich bestehen).
- `/officers`: nur GET-Liste/GET-Detail (personal|leitstelle — Leitstelle braucht die Liste für
  Streifen-Besetzung) und POST/DELETE (personal) sind seitengegated; Self-Service-Routen
  (eigenes Passwort/Avatar/Profil) und Leitungs-Routen behalten ihre eigenen Checks.

**How to apply:** Neue Datenrouten immer mit `requirePages` an die Seite(n) binden, die sie
befüllen — Routen, die mehrere Seiten bedienen, alle Keys angeben. Frontend-Seiten ohne
eigenen Seiten-Key (z. B. Audit-Log nutzt /dashboard/recent-activity) erben faktisch das
Gating der Datenroute. Tests: artifacts/api-server/tests/page-rights.test.ts.

## Officer-Dropdowns nie über GET /officers befüllen

Regel: Namens-Dropdowns (Lead-Agent, Fall-Agenten) nutzen `GET /officers/names` —
auth-only, liefert nur id+name freigegebener Officer. `GET /officers` bleibt
personal|leitstelle-gegated.

**Why:** Fall-Zugriff ist unabhängig von Seitenrechten; ein fallberechtigter Officer
ohne personal/leitstelle bekam sonst leere Dropdowns (Architect-Finding bei
Agenten-Verwaltung).

**How to apply:** Neue UI, die Officer-Namen zur Auswahl braucht, immer über
useGetOfficerNames anbinden, nicht useGetOfficers. Regressionstest:
artifacts/api-server/tests/case-agents.test.ts.
