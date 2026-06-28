---
name: SIDMS Auth
description: Authentication, login gate, registration & leadership-approval rules for the SIDMS FIB app.
---

# SIDMS Auth

- Password hashing is sha256 with a single static salt (no per-user salt) — weak by design and pre-existing; reused for new registration. **Why noted:** if asked to harden auth, this is the thing to replace.
- Seeded officers use plain dienstnummers (e.g. `08`, `34`, `39`), NOT `D-1xxx`. Leadership example seed: `39` (Division Chief). Look up real seed values in the seed/source, don't assume.
- Auth resolves the current officer from a bearer token / auth cookie via a session table; leadership is decided by a rank allowlist.

## Self-registration + approval flow
- `officers.freigegeben` defaults to **true** so existing/admin-created officers stay approved. Self-registration creates a *pending* officer (`freigegeben=false`, placeholder rank). Login is gated: pending accounts get **403**.
- Leadership-only endpoints handle pending officers: list pending, approve (assigns rank + flips freigegeben), reject (deletes).
- **Rule:** approve/reject must only ever act on pending officers (filter on `freigegeben=false` in the query). **Why:** otherwise leadership could delete or re-rank already-active officers through these endpoints.
- Frontend leadership/rank logic lives in a shared `ranks` lib (duplicated allowlist, not imported from a page) — used for nav visibility and the approval rank dropdown.
- **Known gap (tracked as a follow-up task):** the admin officer-create route lacks server-side authz, so the approval model can still be bypassed there.
