---
name: SIDMS Auth
description: Authentication, login gate, registration & leadership-approval rules for the SIDMS FIB app.
---

# SIDMS Auth

- Passwords hashed with `hashPassword` (sha256 + static salt `"fib_salt_2026"`) in `artifacts/api-server/src/lib/auth.ts`. Pre-existing/weak (no per-user salt); reused for new registration too.
- Seeded officers use plain dienstnummers like `08`, `34`, `39` (NOT `D-1001`). Default seed password is `"1234"`. Leadership example: `39` (Division Chief).
- Token from `Authorization: Bearer` header or `auth_token` cookie; sessions in `sessionsTable`. `resolveOfficer(req)` resolves current officer; `isLeadership(rank)` checks LEADERSHIP_RANKS.

## Self-registration + approval flow
- `officers.freigegeben` (boolean, default **true** so existing/admin-created officers stay approved). New self-registrations insert `freigegeben=false`, `rank="Bewerber"`, `status="Abwesend"`.
- `POST /auth/register` (public) → creates pending officer. `POST /auth/login` returns **403** if `!freigegeben`.
- Leadership-only: `GET /officers/pending`, `POST /officers/:id/approve` (sets rank + freigegeben=true + status Anwesend), `POST /officers/:id/reject` (deletes).
- **Rule:** approve/reject WHERE clauses must include `freigegeben=false` so they only ever act on pending officers — never mutate/delete already-approved officers. **Why:** without it, leadership could delete or re-rank active officers via these endpoints.
- Frontend: `isLeadership` duplicated in `artifacts/sidms/src/lib/ranks.ts` (RANK_NAMES + LEADERSHIP_RANKS) for nav visibility + approval dropdown. AuthContext surfaces login 403 message and exposes `register()`.
- Known gap (tracked as a follow-up task): `POST /officers` admin-create route has no server-side authz; approval model can still be bypassed there.
