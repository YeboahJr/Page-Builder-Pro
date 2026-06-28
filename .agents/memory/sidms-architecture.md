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

## Adding a new entity (full-stack pattern)
A new managed entity (table + CRUD + Personal-style page) touches 5 layers in this order: (1) `lib/db/src/schema/<name>.ts` drizzle table + `export *` in schema/index.ts; (2) `lib/api-spec/openapi.yaml` — tag, `/<name>` + `/<name>/{id}` paths, and `<Name>/Create<Name>/Update<Name>` schemas (use `type: ["string","null"]` for nullable text); (3) `pnpm --filter @workspace/api-spec run codegen` (generates hooks `useGet/Create/Update/Delete<Name>` + type); (4) Express route in api-server registered in routes/index.ts (plain-JS validation, NO zod import); (5) frontend page + route in App.tsx. Then `pnpm --filter @workspace/db run push`, restart api-server workflow, typecheck both. The `/personal/id-change` route renders a dedicated page modeled on personal.tsx.

**Why:** Contract-first — openapi.yaml is the source of truth; client hooks and zod schemas are generated, not hand-written.

## Patrol (Streife) data model
Streifenart/Status/Fahrzeug are patrol-level (one per Streife), stored as `patrols` columns patrolType/status/vehicle — NOT per-slot. The `slots` jsonb holds per-position: position/officerId/officerName/notes/abwesend/funkAus (the last two are bool checkboxes per assigned officer). Legacy slot rows may still carry stale patrolType/status/vehicle keys (harmless, ignored). PATCH /patrols/:id accepts patrolType/status/vehicle/slots and passes slots through as jsonb (no schema change needed to add slot fields — just update OpenAPI PatrolSlot + regen). The "Officer im Dienst" panel derives each officer's Anwesend/Abwesend + Funk status from slot assignments, not from the officers table.

**Why:** User wanted these three fields to appear only once per patrol, not repeated on every officer slot row.

## Evidence files (durable rules)
Evidence uploads are tracked in `evidence_files` (DB is the source of truth for listing, not GCS). Any deletion path that removes evidence (per-file DELETE, case DELETE, and any future person/report delete) must also delete matching `evidence_files` rows or files orphan. Rows predating the table won't list without a backfill.
