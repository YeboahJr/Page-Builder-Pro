---
name: SIDMS case visibility model
description: How per-officer case access is determined (name-based matching, Ersteller role)
---

# Case visibility

Non-leadership officers only see/edit cases where they are involved; leadership (same rank set as in auth lib) sees everything.

**Rule:** Involvement = `cases.leadAgent === officer.name` (exact match) OR a `case_agents` row with that officer's exact `name`. There is no FK to officers — matching is by free-text name, so the lead-agent input must exactly equal the officer's stored name for access to work.

**Why:** The legacy data model stores agents as free text; the involvement gate was layered on top without a schema migration.

**How to apply:** When adding case-related routes, enforce access via the shared involvement check in the cases router (401 unauthenticated, 403 foreign case). On case creation the creator is auto-linked with a `case_agents` row of role `Ersteller` (skipped when creator is the lead agent); the detail view's supportingAgents list filters out `Leitender Agent`, `Supervisor`, and `Ersteller` roles. If officers are ever renamed, name-based involvement silently breaks — migrate to officer IDs in that case.
