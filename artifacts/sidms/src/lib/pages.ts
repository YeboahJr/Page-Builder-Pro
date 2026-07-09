export interface PageDef {
  key: string;
  label: string;
}

export const PAGE_DEFS: PageDef[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "leitstelle", label: "Leitstelle" },
  { key: "fallmanagement", label: "Fallmanagement" },
  { key: "staatsanwaltschaft", label: "Staatsanwaltschaft" },
  { key: "personal", label: "Personal" },
  { key: "archiv", label: "Archiv" },
];

export const ALL_PAGE_KEYS = PAGE_DEFS.map((p) => p.key);

// null = keine Seiten zugewiesen (Agenten brauchen explizite Seitenrechte).
// undefined = noch nicht geladen (z. B. alte Session) → nicht blockieren,
// der /me-Refresh liefert die echten Rechte nach; der Server erzwingt sie ohnehin.
export function pageAllowed(
  allowedPages: string[] | null | undefined,
  key: string
): boolean {
  if (allowedPages === undefined) return true;
  if (allowedPages === null) return false;
  return allowedPages.includes(key);
}
