---
name: SIDMS Seitenrechte
description: Konvention für per-Officer Seitenrechte (allowedPages) und deren Grenzen
---

# Seitenrechte (allowedPages)

Regel: `officers.allowedPages` (text[], nullable) — `null` bedeutet seit Einführung des
Rollensystems (Juli 2026) "KEINE Seiten zugewiesen" (vorher: alle). Agenten brauchen
explizite Seitenrechte. Voll-Rollen (Admin/Direktion/Leitung, siehe sidms-roles.md)
sehen immer alles, unabhängig von allowedPages.
Gültige Seiten-Keys: `dashboard`, `leitstelle`, `fallmanagement`, `staatsanwaltschaft`, `personal`, `archiv`
(Backend-Validierung via `parseAllowedPages`, Frontend-Definitionen mit Labels in der sidms-App).

**Why:** Architect-Finding: null=alles war für Agenten ein Broken-Access-Control-Risiko
(neu angelegte Officer hätten Vollzugriff). Bestandsdaten wurden auf explizite Arrays
gebackfillt. Im Frontend gilt: `undefined` (noch nicht geladen) → nicht blockieren,
`null` → keine Seiten; der Server erzwingt die Rechte ohnehin.

**How to apply:** Neue Sidebar-Seiten brauchen einen neuen Key an beiden Stellen
(api-server lib/pages.ts + sidms lib/pages.ts — bewusst dupliziert, kein Shared-Lib).
Rechteänderungen greifen ohne Re-Login, weil der AuthContext den Officer über /auth/me nachlädt.

## Serverseitige Durchsetzung

Daten-API-Routen sind per `requirePages(...keys)`-Middleware (api-server) nach Seitenrechten
gefiltert: 401 ohne Login, 403 ohne passendes Seitenrecht; Voll-Rollen passieren immer,
allowedPages=null wird abgelehnt. Mapping (mehrere Keys = "eine der Seiten reicht"):
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
