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
  "Bewerber",
  "Suspended",
];

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
