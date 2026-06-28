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

The patrol `status` is a fixed frontend-defined list (STATUS_META in leitstelle.tsx) with per-status colors; changing the list requires migrating existing DB `patrols.status` rows off removed values (one-off SQL UPDATE) or the dropdown shows blank for stale rows. The Streifenverwaltung page has NO save button — it auto-saves each patrol via a 500ms debounce. The save is serialized per patrol with a monotonic revision token (revisionRef vs savedRevisionRef) so an edit made during an in-flight save is never dropped; on ack the PATCH return is written into the react-query cache via setQueryData and the local draft cleared only when fully synced.

**Why:** A naive "clear draft after save" drops edits typed while the request was in flight; the revision token is what makes debounced auto-save safe.

## Evidence files (durable rules)
Evidence uploads are tracked in `evidence_files` (DB is the source of truth for listing, not GCS). Any deletion path that removes evidence (per-file DELETE, case DELETE, and any future person/report delete) must also delete matching `evidence_files` rows or files orphan. Rows predating the table won't list without a backfill.

The GCS client config + the evidence object-path scheme (`<gcsPrefix>/case-<id>/<filename>` in GCS, `/objects/case-<id>/<filename>` app-side) live in ONE shared lib `@workspace/object-storage` (lib/object-storage). Both the api-server (objectStorage.ts re-exports its client; cases.ts uses the path helpers) and the scripts backfill import from it. Never reconstruct these paths inline again — change the scheme only in lib/object-storage/src/paths.ts so the live upload/delete and the backfill can't drift.

**Why:** Scripts and artifacts can't import from each other (pnpm rule), so the layout was copied into both and could silently diverge, producing evidence_files rows that don't match real objects.

## Delete handlers must surface failures, not return silent 204
The generated React-Query hooks call `customFetch` (lib/api-client-react/src/custom-fetch.ts) which **throws `ApiError` on any non-2xx**, so `mutateAsync` rejects and frontend try/catch blocks show the error. This only works if the server returns a real error status. Every DELETE handler must validate the id (400), 404 when the row doesn't exist (don't return 204 for a no-op delete — the client would falsely remove a row), and wrap multi-table deletes in `db.transaction` so a mid-way DB failure rolls back and propagates as 500 instead of leaving a partially-deleted record reported as success. Mirror the officers/idchanges delete pattern.

**Why:** A 204 for a missing/failed delete is a silent failure — the UI removes the item even though nothing (or only part of it) was deleted.
