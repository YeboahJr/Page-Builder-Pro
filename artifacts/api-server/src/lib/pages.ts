export const PAGE_KEYS = [
  "dashboard",
  "leitstelle",
  "fallmanagement",
  "personal",
  "archiv",
] as const;

export type PageKey = (typeof PAGE_KEYS)[number];

const PAGE_KEY_SET = new Set<string>(PAGE_KEYS);

export function parseAllowedPages(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const pages = value.filter((p): p is string => typeof p === "string");
  if (pages.length !== value.length) return null;
  const invalid = pages.filter((p) => !PAGE_KEY_SET.has(p));
  if (invalid.length > 0) return null;
  return Array.from(new Set(pages));
}
