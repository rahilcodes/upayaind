import { describe, expect, it, vi } from "vitest";
import { countryAlternates, countryPath, marketForSegment } from "@/lib/market";
import { buildIndexNowBody, indexNowKey, pingIndexNow, INDEXNOW_ENDPOINT } from "@/server/services/indexnow";

/** Per-country pages and IndexNow (D-172). */
describe("country pages", () => {
  it("puts the US at the root and every other country under its segment", () => {
    expect(countryPath("US", "/pricing")).toBe("/pricing");
    expect(countryPath("UK", "/pricing")).toBe("/uk/pricing");
    expect(countryPath("IN", "/pricing")).toBe("/in/pricing");
  });
  it("maps a URL segment back to its market and rejects the rest", () => {
    expect(marketForSegment("uk")).toBe("UK");
    expect(marketForSegment("NZ")).toBe("NZ");
    expect(marketForSegment("us")).toBeNull();
    expect(marketForSegment("blog")).toBeNull();
    expect(marketForSegment(undefined)).toBeNull();
  });
  it("builds one hreflang entry per country plus x-default on the US page", () => {
    expect(countryAlternates("/pricing")).toEqual({
      "en-US": "/pricing",
      "en-IN": "/in/pricing",
      "en-GB": "/uk/pricing",
      "en-CA": "/ca/pricing",
      "en-AU": "/au/pricing",
      "en-NZ": "/nz/pricing",
      "x-default": "/pricing",
    });
  });
});

describe("IndexNow", () => {
  const key = "0123456789abcdef0123456789abcdef";
  const origin = "https://upayaind.com";

  it("accepts only well-formed keys", () => {
    expect(indexNowKey(key)).toBe(key);
    expect(indexNowKey(` ${key} `)).toBe(key);
    expect(indexNowKey("short")).toBeNull();
    expect(indexNowKey("has spaces in the key")).toBeNull();
    expect(indexNowKey("")).toBeNull();
  });

  it("builds absolute, de-duplicated URLs with the key location", () => {
    expect(buildIndexNowBody(["/blog/uk-cv-format", "/blog", "/blog"], { key, origin })).toEqual({
      host: "upayaind.com",
      key,
      keyLocation: "https://upayaind.com/indexnow.txt",
      urlList: ["https://upayaind.com/blog/uk-cv-format", "https://upayaind.com/blog"],
    });
  });

  it("sends nothing without a key, for a local site or for off-site paths", () => {
    expect(buildIndexNowBody(["/blog"], { key: null, origin })).toBeNull();
    expect(buildIndexNowBody(["/blog"], { key, origin: "http://localhost:3000" })).toBeNull();
    expect(buildIndexNowBody(["//evil.example/x", "https://evil.example"], { key, origin })).toBeNull();
  });

  it("posts once and never throws", async () => {
    const ok = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 200 }));
    expect(await pingIndexNow(["/blog"], { fetch: ok as unknown as typeof fetch, key, origin })).toBe("sent");
    expect(ok).toHaveBeenCalledTimes(1);
    expect(ok.mock.calls[0]?.[0]).toBe(INDEXNOW_ENDPOINT);

    const skipped = vi.fn();
    expect(await pingIndexNow(["/blog"], { fetch: skipped as unknown as typeof fetch, key: null, origin })).toBe("skipped");
    expect(skipped).not.toHaveBeenCalled();

    const boom = vi.fn(async () => {
      throw new Error("network down");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await pingIndexNow(["/blog"], { fetch: boom as unknown as typeof fetch, key, origin })).toBe("failed");
    err.mockRestore();
  });
});
