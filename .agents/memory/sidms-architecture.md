---
name: SIDMS Architecture
description: Key architecture decisions for the SIDMS app — API server build/start pattern, routing, and tech stack.
---

# SIDMS Architecture

## API Server Build Pattern
The API server runs `pnpm run build && pnpm run start` in dev mode (not tsx watch). Changes to route files require **restarting the workflow** to take effect — the esbuild bundle must be rebuilt. This caused confusion when routes existed in source but not in the compiled bundle.

**Why:** The dev script is `export NODE_ENV=development && pnpm run build && pnpm run start`, so it always builds first.

**How to apply:** After editing any API server source file, restart the `artifacts/api-server: API Server` workflow to rebuild and reload.

## Proxy Routing
- API server on port 8080, path `/api`
- Frontend on port 19424, path `/`
- Requests go through shared proxy at localhost:80

## Pages Implemented
- Login (/login) — real auth via POST /api/auth/login
- Dashboard (/dashboard) — stats cards, case table, case detail panel with tabs, search & filter
- Meldungen (/leitstelle/meldungen) — emergency reports list, critical incident panel, system info
- Streifen (/leitstelle/streifen) — patrol slot editor, officer-on-duty panel
- Fallmanagement (/fallmanagement) — case CRUD table with create/delete modal
- Beweismittel (/beweismittel) — evidence table with add modal
- Personal (/personal) — officer list
- Audit-Log (/audit-log) — activity feed
- Archiv (/archiv) — closed cases
- Einstellungen (/einstellungen) — profile and system info
