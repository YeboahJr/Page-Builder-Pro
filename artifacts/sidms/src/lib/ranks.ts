export const RANK_NAMES: string[] = [
  "Director of FIB",
  "Vize Director of FIB",
  "Assistant Director of FIB",
  "Secretary of FIB",
  "Human Resources Director",
  "Management Chief",
  "Division Chief",
  "Deputy Division Chief",
  "Unit Commander",
  "Management Division Chief",
  "Academy Agent",
  "Commander",
  "Supervising Head Agent",
  "Supervising Agent",
  "007 Agent [Media]",
  "Head Agent",
  "Elite Agent",
  "Senior Special Agent",
  "Special Agent",
  "Junior Special Agent",
  "Senior Field Agent",
  "Field Agent",
  "Junior Field Agent",
  "Senior Agent",
  "Agent",
  "Junior Agent",
  "Agent in Education",
  "Facility Manager",
  "STA",
  "Bewerber",
  "Suspended",
];

// Rein kosmetisch: Leitungsränge werden z. B. golden hervorgehoben.
// Rechte werden NICHT mehr über den Rang vergeben, sondern über die
// unsichtbare Rolle (siehe hasFullAccess unten).
export const LEADERSHIP_RANKS = new Set<string>([
  "Director of FIB",
  "Vize Director of FIB",
  "Assistant Director of FIB",
  "Secretary of FIB",
  "Human Resources Director",
  "Management Chief",
  "Division Chief",
  "Deputy Division Chief",
  "Unit Commander",
  "Management Division Chief",
]);

export function isLeadership(rank: string | null | undefined): boolean {
  return rank != null && LEADERSHIP_RANKS.has(rank);
}

// Unsichtbare Berechtigungsrollen (officer.role):
// Admin, Direktion und Leitung haben alle Rechte; Agent und STA haben nur
// die per Seitenrechte (allowedPages) zugewiesenen Seiten.
export const ASSIGNABLE_ROLES = ["Direktion", "Leitung", "Agent", "STA"] as const;

export const FULL_ACCESS_ROLES = new Set<string>(["Admin", "Direktion", "Leitung"]);

export function hasFullAccess(role: string | null | undefined): boolean {
  return role != null && FULL_ACCESS_ROLES.has(role);
}
