import { describe, expect, it } from "vitest";
import { ALL_PAGE_KEYS, PAGE_DEFS, pageAllowed } from "../src/lib/pages";

describe("pageAllowed", () => {
  it("treats null as no pages assigned", () => {
    for (const key of ALL_PAGE_KEYS) {
      expect(pageAllowed(null, key), key).toBe(false);
    }
  });

  it("treats undefined as full access to every page", () => {
    for (const key of ALL_PAGE_KEYS) {
      expect(pageAllowed(undefined, key), key).toBe(true);
    }
  });

  it("allows only the listed pages", () => {
    const allowed = ["dashboard", "archiv"];
    expect(pageAllowed(allowed, "dashboard")).toBe(true);
    expect(pageAllowed(allowed, "archiv")).toBe(true);
    expect(pageAllowed(allowed, "leitstelle")).toBe(false);
    expect(pageAllowed(allowed, "fallmanagement")).toBe(false);
    expect(pageAllowed(allowed, "personal")).toBe(false);
  });

  it("denies every page for an empty list", () => {
    for (const key of ALL_PAGE_KEYS) {
      expect(pageAllowed([], key), key).toBe(false);
    }
  });

  it("matches keys exactly (case-sensitive, no trimming)", () => {
    expect(pageAllowed(["dashboard"], "Dashboard")).toBe(false);
    expect(pageAllowed(["dashboard"], " dashboard")).toBe(false);
    expect(pageAllowed(["Dashboard"], "dashboard")).toBe(false);
  });

  it("keeps PAGE_DEFS and ALL_PAGE_KEYS in sync", () => {
    expect(ALL_PAGE_KEYS).toEqual(PAGE_DEFS.map((p) => p.key));
    expect(new Set(ALL_PAGE_KEYS).size).toBe(ALL_PAGE_KEYS.length);
  });
});
