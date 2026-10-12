import { describe, expect, it } from "vitest";
import { domainFromUrl, normalizeJobUrl } from "@/lib/url-normalize";

describe("normalizeJobUrl (SPEC F4)", () => {
  it("strips tracking params, lowercases host, drops www/hash/trailing slash", () => {
    expect(normalizeJobUrl("https://WWW.Acme.com/Jobs/123/?utm_source=linkedin&utm_medium=x#apply")).toBe("https://acme.com/Jobs/123");
  });
  it("keeps meaningful params in a stable order", () => {
    expect(normalizeJobUrl("https://www.indeed.com/viewjob?vjk=zzz&jk=abc123&from=serp")).toBe("https://indeed.com/viewjob?jk=abc123");
    expect(normalizeJobUrl("https://x.com/a?b=2&a=1")).toBe(normalizeJobUrl("https://x.com/a?a=1&b=2"));
  });
  it("treats LinkedIn tracking variants as the same job", () => {
    const a = normalizeJobUrl("https://www.linkedin.com/jobs/view/3912345678/?refId=abc&trackingId=xyz");
    const b = normalizeJobUrl("https://linkedin.com/jobs/view/3912345678");
    expect(a).toBe(b);
  });
  it("accepts URLs without a scheme", () => {
    expect(normalizeJobUrl("careers.acme.com/role/1")).toBe("https://careers.acme.com/role/1");
  });
});

describe("domainFromUrl", () => {
  it("returns company domains but not job boards", () => {
    expect(domainFromUrl("https://careers.acme.com/jobs/1")).toBe("acme.com");
    expect(domainFromUrl("https://www.linkedin.com/jobs/view/1")).toBeNull();
    expect(domainFromUrl("https://boards.greenhouse.io/acme/jobs/1")).toBeNull();
  });
});
