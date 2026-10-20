import { describe, expect, it } from "vitest";
import { HOME_PATHS, homeAlternates, homePathForMarket, isCountryHomePath, marketForHomePath, normalizeMarket, resolveMarket } from "@/lib/market";

/** Country homepages + market resolution (D-141). Pure helpers shared by the middleware and the chrome. */
describe("normalizeMarket", () => {
  it("upper-cases and maps GB to UK", () => {
    expect(normalizeMarket("gb")).toBe("UK");
    expect(normalizeMarket(" in ")).toBe("IN");
    expect(normalizeMarket("US")).toBe("US");
  });
  it("rejects unknown and empty codes", () => {
    expect(normalizeMarket("FR")).toBeNull();
    expect(normalizeMarket("")).toBeNull();
    expect(normalizeMarket(undefined)).toBeNull();
  });
});

describe("resolveMarket", () => {
  it("prefers ?market=, then the cookie, then the geo header, then US", () => {
    expect(resolveMarket({ override: "us", cookie: "IN", geo: "GB" })).toBe("US");
    expect(resolveMarket({ cookie: "IN", geo: "GB" })).toBe("IN");
    expect(resolveMarket({ geo: "GB" })).toBe("UK");
    expect(resolveMarket({})).toBe("US");
  });
  it("skips invalid values at each level", () => {
    expect(resolveMarket({ override: "XX", cookie: "nope", geo: "IN" })).toBe("IN");
    expect(resolveMarket({ override: "XX", cookie: "nope", geo: "FR" })).toBe("US");
  });
});

describe("homePathForMarket", () => {
  it("maps IN and UK to their pages and everything else to /", () => {
    expect(homePathForMarket("IN")).toBe("/in");
    expect(homePathForMarket("UK")).toBe("/uk");
    expect(homePathForMarket("GB")).toBe("/uk");
    expect(homePathForMarket("US")).toBe("/");
    expect(homePathForMarket("CA")).toBe("/");
    expect(homePathForMarket("AU")).toBe("/");
    expect(homePathForMarket("FR")).toBe("/");
    expect(homePathForMarket(null)).toBe("/");
  });
  it("round-trips with marketForHomePath", () => {
    for (const [m, path] of Object.entries(HOME_PATHS)) expect(marketForHomePath(path)).toBe(m);
    expect(marketForHomePath("/in/")).toBe("IN");
    expect(marketForHomePath("/pricing")).toBeNull();
    expect(isCountryHomePath("/uk")).toBe(true);
    expect(isCountryHomePath("/about")).toBe(false);
  });
});

describe("homeAlternates", () => {
  it("lists hreflang for the three homepages with x-default on the US page", () => {
    expect(homeAlternates()).toEqual({ "en-US": "/", "en-IN": "/in", "en-GB": "/uk", "x-default": "/" });
  });
});
