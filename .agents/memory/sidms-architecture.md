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

## Evidence files (durable rules)
Evidence uploads are tracked in `evidence_files` (DB is the source of truth for listing, not GCS). Any deletion path that removes evidence (per-file DELETE, case DELETE, and any future person/report delete) must also delete matching `evidence_files` rows or files orphan. Rows predating the table won't list without a backfill.
