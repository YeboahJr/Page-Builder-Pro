import type { Request, Response, NextFunction, RequestHandler } from "express";
import { resolveOfficer, isLeadership } from "../lib/auth";
import type { PageKey } from "../lib/pages";

/**
 * Server-side enforcement of per-officer page rights (officers.allowedPages).
 *
 * A data route is tied to the page(s) it backs. Access is granted when the
 * requesting officer:
 *  - has a leadership rank (leadership always sees everything), or
 *  - has allowedPages = null (null means "all pages allowed"), or
 *  - has at least one of the given page keys in allowedPages.
 *
 * Unauthenticated requests get 401; authenticated officers without the
 * required page right get 403.
 */
export function requirePages(...keys: PageKey[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const officer = await resolveOfficer(req);
    if (!officer) {
      res.status(401).json({ error: "Nicht angemeldet" });
      return;
    }
    if (isLeadership(officer.rank)) {
      next();
      return;
    }
    const allowedPages = officer.allowedPages;
    if (allowedPages == null || keys.some((k) => allowedPages.includes(k))) {
      next();
      return;
    }
    res.status(403).json({ error: "Keine Berechtigung für diese Seite" });
  };
}
