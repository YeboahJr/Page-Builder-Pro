import { describe, expect, it } from "vitest";
import { PAGE_KEYS, parseAllowedPages } from "../src/lib/pages";

describe("parseAllowedPages", () => {
  it("returns undefined when the value is not provided", () => {
    expect(parseAllowedPages(undefined)).toBeUndefined();
  });

  it("accepts an empty array (no pages allowed)", () => {
    expect(parseAllowedPages([])).toEqual([]);
  });

  it("accepts all known page keys", () => {
    expect(parseAllowedPages([...PAGE_KEYS])).toEqual([...PAGE_KEYS]);
  });

  it("accepts a subset of known page keys", () => {
    expect(parseAllowedPages(["dashboard", "archiv"])).toEqual(["dashboard", "archiv"]);
  });

  it("deduplicates repeated keys", () => {
    expect(parseAllowedPages(["dashboard", "dashboard", "personal"])).toEqual([
      "dashboard",
      "personal",
    ]);
  });

  it("rejects unknown page keys", () => {
    expect(parseAllowedPages(["dashboard", "geheim"])).toBeNull();
    expect(parseAllowedPages(["Dashboard"])).toBeNull();
    expect(parseAllowedPages([" dashboard"])).toBeNull();
  });

  it("rejects arrays containing non-string entries", () => {
    expect(parseAllowedPages(["dashboard", 1])).toBeNull();
    expect(parseAllowedPages([null])).toBeNull();
    expect(parseAllowedPages([undefined])).toBeNull();
    expect(parseAllowedPages([{ key: "dashboard" }])).toBeNull();
  });

  it("rejects non-array values", () => {
    expect(parseAllowedPages(null)).toBeNull();
    expect(parseAllowedPages("dashboard")).toBeNull();
    expect(parseAllowedPages(42)).toBeNull();
    expect(parseAllowedPages({ dashboard: true })).toBeNull();
    expect(parseAllowedPages(true)).toBeNull();
  });
});
