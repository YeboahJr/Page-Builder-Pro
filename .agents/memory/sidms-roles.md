---
name: SIDMS Rollensystem
description: Unsichtbare Berechtigungsrollen (officers.role) — Rechte hängen an der Rolle, nicht am Rang
---

# Unsichtbares Rollensystem

Regel: `officers.role` ("Admin" | "Direktion" | "Leitung" | "Agent", default "Agent")
vergibt die Rechte. Admin/Direktion/Leitung = Vollzugriff (`hasFullAccess(role)`,
dupliziert in api-server lib/auth.ts und sidms lib/ranks.ts). Agent = nur allowedPages.
Der sichtbare FIB-Rang (`officers.rank`) ist rein kosmetisch (goldene Hervorhebung via
`isLeadership(rank)`) und vergibt KEINE Rechte mehr.

**Why:** Nutzeranforderung: Rechte sollen unabhängig vom sichtbaren RP-Rang steuerbar
sein; Rollen erscheinen nirgends als Rang in der UI. Vorher hingen alle Rechte an
`isLeadership(rank)` — Rangänderungen hätten Rechte verändert.

**How to apply:** Neue Rechtechecks immer über `hasFullAccess(officer.role)`, nie über
den Rang. Rollen ändern nur über PUT /officers/:id/pages (optionales `role`-Feld;
alle Rollen außer Admin zuweisbar; Admin-Rolle unveränderbar; eigene Rolle nicht
änderbar → Lockout-Schutz). UI: Rollen-Dropdown auf der Administration-Seite.
Neue eingeschränkte Rollen: in ROLES/ASSIGNABLE_ROLES (Server + Client),
OpenAPI-role-enum + codegen eintragen; NICHT in FULL_ACCESS_ROLES — dann greift
allowedPages automatisch. Die frühere STA-Rolle samt Rang und Staatsanwaltschaft-Seite wurde im Juli 2026 entfernt.

## Admin-User

Geseedeter System-User: dienstnummer "Admin", Name "Admin", role "Admin",
freigegeben; das Passwort wurde vom Nutzer vorgegeben und steht bewusst nicht
hier. Existiert nur in der Dev-DB — bei neuer/Prod-Umgebung muss er erneut
angelegt werden (INSERT mit hashPassword aus api-server lib/auth.ts).
Test-Fixtures für Leitungsrechte brauchen jetzt `role: "Leitung"`, ein Leitungsrang
allein reicht nicht mehr.
