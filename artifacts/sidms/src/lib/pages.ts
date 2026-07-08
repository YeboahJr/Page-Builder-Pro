export interface PageDef {
  key: string;
  label: string;
}

export const PAGE_DEFS: PageDef[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "leitstelle", label: "Leitstelle" },
  { key: "fallmanagement", label: "Fallmanagement" },
  { key: "personal", label: "Personal" },
  { key: "archiv", label: "Archiv" },
];

export const ALL_PAGE_KEYS = PAGE_DEFS.map((p) => p.key);

export function pageAllowed(
  allowedPages: string[] | null | undefined,
  key: string
): boolean {
  if (allowedPages == null) return true;
  return allowedPages.includes(key);
}
