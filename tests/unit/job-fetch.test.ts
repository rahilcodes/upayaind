import { describe, expect, it } from "vitest";
import { assertSafeUrl, decodeEntities, detectWorkMode, extractJobFromHtml, fetchHtml, fetchJobPosting, htmlToText, isBlockedAddress, FETCH_MAX_BYTES, type FetchLike, type Resolver } from "@/server/services/job-fetch";

/** Resolver that maps public hosts to a public IP and leaks nothing else. */
const resolve: Resolver = async (host) => {
  if (host === "jobs.example.com" || host === "boards.greenhouse.io") return ["93.184.216.34"];
  if (host === "evil.example.com") return ["93.184.216.34", "10.0.0.5"]; // DNS answer that includes a private address
  if (host === "meta.example.com") return ["169.254.169.254"];
  throw new Error("ENOTFOUND");
};

const html = (body: string, head = "") => `<!doctype html><html><head><title>Page</title>${head}</head><body>${body}</body></html>`;

const JSONLD_PAGE = html(
  `<nav>Home · Jobs · Sign in</nav>
   <main><h1>Senior Data Analyst</h1><div>Some teaser</div></main>
   <footer>© Acme</footer>`,
  `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Senior Data Analyst",
    description: "<p>We are hiring a <strong>Senior Data Analyst</strong> to join our team.</p><ul><li>Build dashboards &amp; reports</li><li>Own SQL pipelines</li></ul><p>This is a hybrid role (3 days in office).</p>",
    hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
    jobLocation: [{ "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Austin", addressRegion: "TX", addressCountry: "US" } }],
    employmentType: ["FULL_TIME"],
    datePosted: "2026-10-01",
  })}</script>`,
);

const GRAPH_PAGE = html(
  "<p>irrelevant</p>",
  `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: "x" },
      { "@type": "JobPosting", title: "Backend Engineer", description: "Remote-first engineering role. ".repeat(5), hiringOrganization: { name: "Globex" }, jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: "USA" }, employmentType: "CONTRACTOR" },
    ],
  })}</script>`,
);

const PLAIN_PAGE = html(
  `<header><nav><a href="/">Home</a><a href="/jobs">Jobs</a></nav></header>
   <aside>Related jobs: Analyst, Engineer, Designer, Manager, Scientist, lots of noise here to make it long</aside>
   <main>
     <h1>Product Manager - Payments</h1>
     <div class="job-description">
       <p>Initech is looking for a Product Manager to lead our payments roadmap. This is a fully <b>remote</b> position within the United&nbsp;States.</p>
       <h2>Responsibilities</h2>
       <ul><li>Define the roadmap &amp; priorities</li><li>Work with engineering &ndash; daily</li></ul>
       <h2>Requirements</h2>
       <ul><li>5+ years product experience</li><li>Full-time availability</li></ul>
       <script>window.track = function(){ alert("tracked") }</script>
       <style>.x{color:red}</style>
     </div>
   </main>
   <footer>Privacy · Terms · © 2026 Initech</footer>`,
  `<meta property="og:site_name" content="Initech Careers"><meta property="og:title" content="Product Manager - Payments | Initech">`,
);

describe("job-fetch — SSRF guard", () => {
  it("blocks loopback, private, link-local/metadata, CGNAT, multicast and IPv6 equivalents", () => {
    for (const ip of ["127.0.0.1", "127.9.9.9", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "ff02::1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:2800:220:1:248:1893:25c8:1946"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });

  it("rejects non-http(s) schemes, credentials, odd ports and local hostnames", async () => {
    await expect(assertSafeUrl("file:///etc/passwd", resolve)).rejects.toThrow(/Only http/);
    await expect(assertSafeUrl("ftp://jobs.example.com/x", resolve)).rejects.toThrow(/Only http/);
    await expect(assertSafeUrl("gopher://jobs.example.com", resolve)).rejects.toThrow(/Only http/);
    await expect(assertSafeUrl("https://user:pw@jobs.example.com/x", resolve)).rejects.toThrow(/credentials/);
    await expect(assertSafeUrl("http://jobs.example.com:8080/x", resolve)).rejects.toThrow(/ports/);
    await expect(assertSafeUrl("http://localhost/x", resolve)).rejects.toThrow(/can't be fetched/);
    await expect(assertSafeUrl("http://intranet/x", resolve)).rejects.toThrow(/can't be fetched/);
    await expect(assertSafeUrl("http://db.internal/x", resolve)).rejects.toThrow(/can't be fetched/);
  });

  it("rejects IP literals and hostnames that resolve to private / metadata addresses", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/admin", resolve)).rejects.toThrow(/can't be fetched/);
    await expect(assertSafeUrl("http://10.0.0.8/", resolve)).rejects.toThrow(/can't be fetched/);
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data/", resolve)).rejects.toThrow(/can't be fetched/);
    await expect(assertSafeUrl("http://[::1]/", resolve)).rejects.toThrow(/can't be fetched/);
    await expect(assertSafeUrl("http://2130706433/", resolve)).rejects.toThrow(/can't be fetched/); // decimal 127.0.0.1 → URL normalises to 127.0.0.1
    await expect(assertSafeUrl("https://meta.example.com/x", resolve)).rejects.toThrow(/can't be fetched/);
    await expect(assertSafeUrl("https://evil.example.com/x", resolve)).rejects.toThrow(/can't be fetched/);
    await expect(assertSafeUrl("https://nope.example.com/x", resolve)).rejects.toThrow(/couldn't reach/);
  });

  it("accepts a public https URL (adds the scheme when missing)", async () => {
    const r = await assertSafeUrl("jobs.example.com/view/1", resolve);
    expect(r.url.toString()).toBe("https://jobs.example.com/view/1");
    expect(r.addresses).toEqual(["93.184.216.34"]);
  });
});

describe("job-fetch — fetchHtml limits", () => {
  const mk = (handler: (url: string) => Response | Promise<Response>): FetchLike => async (url) => handler(url);

  it("follows up to 3 redirects, re-checking every hop", async () => {
    const seen: string[] = [];
    const f = mk((u) => {
      seen.push(u);
      if (u.endsWith("/a")) return new Response(null, { status: 302, headers: { location: "/b" } });
      if (u.endsWith("/b")) return new Response(null, { status: 301, headers: { location: "https://boards.greenhouse.io/c" } });
      return new Response("<html><body><main>ok</main></body></html>", { status: 200, headers: { "content-type": "text/html" } });
    });
    const r = await fetchHtml("https://jobs.example.com/a", { fetchImpl: f, resolve });
    expect(r.finalUrl).toBe("https://boards.greenhouse.io/c");
    expect(seen).toHaveLength(3);
  });

  it("refuses a redirect to a private address", async () => {
    const f = mk(() => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }));
    await expect(fetchHtml("https://jobs.example.com/a", { fetchImpl: f, resolve })).rejects.toThrow(/can't be fetched/);
  });

  it("stops after too many redirects", async () => {
    const f = mk(() => new Response(null, { status: 302, headers: { location: "/again" } }));
    await expect(fetchHtml("https://jobs.example.com/a", { fetchImpl: f, resolve })).rejects.toThrow(/Too many redirects/);
  });

  it("rejects non-HTML, oversized bodies and bot blocks with friendly messages", async () => {
    await expect(fetchHtml("https://jobs.example.com/x.pdf", { fetchImpl: mk(() => new Response("x", { headers: { "content-type": "application/pdf" } })), resolve })).rejects.toThrow(/isn't a web page/);
    await expect(fetchHtml("https://jobs.example.com/big", { fetchImpl: mk(() => new Response("x", { headers: { "content-type": "text/html", "content-length": String(FETCH_MAX_BYTES + 1) } })), resolve })).rejects.toThrow(/too large/);
    const huge = "a".repeat(FETCH_MAX_BYTES + 10);
    await expect(fetchHtml("https://jobs.example.com/big2", { fetchImpl: mk(() => new Response(huge, { headers: { "content-type": "text/html" } })), resolve })).rejects.toThrow(/too large/);
    await expect(fetchHtml("https://jobs.example.com/blocked", { fetchImpl: mk(() => new Response("no", { status: 403 })), resolve })).rejects.toThrow(/blocks automatic fetching/);
    await expect(fetchHtml("https://jobs.example.com/gone", { fetchImpl: mk(() => new Response("no", { status: 404 })), resolve })).rejects.toThrow(/HTTP 404/);
  });

  it("times out", async () => {
    let t = 0;
    const f: FetchLike = async (_u, init) => {
      t += 9_000; // pretend 9 s passed
      return new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    };
    await expect(fetchHtml("https://jobs.example.com/slow", { fetchImpl: f, resolve, now: () => t })).rejects.toThrow(/took too long/);
  });

  it("sends a browser-like User-Agent and manual redirects", async () => {
    let init: RequestInit | undefined;
    const f: FetchLike = async (_u, i) => {
      init = i;
      return new Response("<main>hello world</main>", { headers: { "content-type": "text/html" } });
    };
    await fetchHtml("https://jobs.example.com/ua", { fetchImpl: f, resolve });
    expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/Mozilla/);
    expect(init?.redirect).toBe("manual");
  });
});

describe("job-fetch — extraction", () => {
  it("decodes entities and converts HTML to readable text", () => {
    expect(decodeEntities("A &amp; B &lt;c&gt; &#39;d&#39; &#x2014; &ndash; &nbsp;x &unknown;")).toBe("A & B <c> 'd' — –  x &unknown;");
    const t = htmlToText("<div><h2>Reqs</h2><ul><li>One &amp; two</li><li>Three</li></ul><p>Para<br>line</p><script>bad()</script></div>");
    expect(t).toBe("Reqs\n\n• One & two\n• Three\n\nPara\nline");
  });

  it("prefers JSON-LD JobPosting (title, company, location, description, employment type, work mode)", () => {
    const r = extractJobFromHtml(JSONLD_PAGE, "https://jobs.example.com/1");
    expect(r.method).toBe("jsonld");
    expect(r.title).toBe("Senior Data Analyst");
    expect(r.company).toBe("Acme Corp");
    expect(r.location).toBe("Austin, TX, US");
    expect(r.employmentType).toBe("FULL_TIME");
    expect(r.workMode).toBe("HYBRID");
    expect(r.description).toContain("• Build dashboards & reports");
    expect(r.description).not.toMatch(/<[a-z]/i);
  });

  it("finds JobPosting inside @graph and maps TELECOMMUTE / CONTRACTOR", () => {
    const r = extractJobFromHtml(GRAPH_PAGE, "https://x.example.com");
    expect(r.method).toBe("jsonld");
    expect(r.title).toBe("Backend Engineer");
    expect(r.company).toBe("Globex");
    expect(r.location).toBe("USA");
    expect(r.workMode).toBe("REMOTE");
    expect(r.employmentType).toBe("CONTRACT");
  });

  it("falls back to the main text block, h1 and og:site_name on plain pages", () => {
    const r = extractJobFromHtml(PLAIN_PAGE, "https://initech.example.com/jobs/pm");
    expect(r.method).toBe("text");
    expect(r.title).toBe("Product Manager - Payments");
    expect(r.company).toBe("Initech Careers");
    expect(r.workMode).toBe("REMOTE");
    expect(r.employmentType).toBe("FULL_TIME");
    expect(r.description).toContain("lead our payments roadmap");
    expect(r.description).toContain("• Define the roadmap & priorities");
    expect(r.description).toContain("Work with engineering – daily");
    expect(r.description).not.toContain("tracked");
    expect(r.description).not.toContain("color:red");
    expect(r.description).not.toContain("Privacy · Terms");
    expect(r.description).not.toContain("Related jobs");
  });

  it("detects work mode from wording", () => {
    expect(detectWorkMode("Hybrid - Austin")).toBe("HYBRID");
    expect(detectWorkMode("Fully remote within the US")).toBe("REMOTE");
    expect(detectWorkMode("This role is on-site in Dallas")).toBe("ONSITE");
    expect(detectWorkMode("Software Engineer")).toBeNull();
  });

  it("ignores broken JSON-LD and reports an empty page", async () => {
    const page = html("<main><p>Hi</p></main>", `<script type="application/ld+json">{not json</script>`);
    const r = extractJobFromHtml(page, "https://jobs.example.com/x");
    expect(r.method).toBe("text");
    const f: FetchLike = async () => new Response(page, { headers: { "content-type": "text/html" } });
    await expect(fetchJobPosting({ id: "u1", role: "EMPLOYEE" }, "https://jobs.example.com/x", { fetchImpl: f, resolve })).rejects.toThrow(/couldn't find a job description/);
  });

  it("fetchJobPosting end to end with fixtures", async () => {
    const f: FetchLike = async () => new Response(JSONLD_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    const r = await fetchJobPosting({ id: "u2", role: "EMPLOYEE" }, "jobs.example.com/view/42", { fetchImpl: f, resolve });
    expect(r.url).toBe("https://jobs.example.com/view/42");
    expect(r.company).toBe("Acme Corp");
  });
});
