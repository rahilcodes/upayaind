import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

import { db } from "@/server/db";
import {
  CmsError,
  MAX_REVISIONS,
  pushRevision,
  renderRichText,
  restoreRevision,
  safeHref,
  sanitizeDoc,
  saveEntry,
  setPublished,
  slugSchema,
  softDelete,
  splitData,
  toSlug,
  videoEmbedUrl,
  computePublicStats,
  type Revision,
} from "@/server/services/cms";
import { resetDb } from "../setup/db";

const p = (text: string, marks?: unknown[]) => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });
const doc = (...content: unknown[]) => ({ type: "doc", content });

async function admin() {
  return db.user.create({ data: { email: `a${Date.now()}${Math.random()}@t.test`, name: "Ada Admin", role: "ADMIN" }, select: { id: true, name: true } });
}

describe("HTML sanitisation (allow-list)", () => {
  it("renders allowed nodes and marks", () => {
    const { html } = renderRichText(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
        p("bold", [{ type: "bold" }]),
        { type: "bulletList", content: [{ type: "listItem", content: [p("one")] }] },
        { type: "blockquote", content: [p("quote")] },
      ),
    );
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<ul><li><p>one</p></li></ul>");
    expect(html).toContain("<blockquote><p>quote</p></blockquote>");
  });

  it("escapes text — no raw HTML from text nodes", () => {
    const { html } = renderRichText(doc(p('<script>alert(1)</script><img src=x onerror="alert(1)">')));
    expect(html).not.toMatch(/<script|<img/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops unknown nodes and marks (iframe, script, custom)", () => {
    const clean = sanitizeDoc(
      doc(
        { type: "iframe", attrs: { src: "https://evil.test" } },
        { type: "script", content: [{ type: "text", text: "x" }] },
        p("hi", [{ type: "textStyle", attrs: { style: "color:red" } }, { type: "italic" }]),
      ),
    );
    expect(JSON.stringify(clean)).not.toMatch(/iframe|script|textStyle|style/);
    expect(clean.content).toHaveLength(1);
    expect(clean.content![0]!.content![0]!.marks).toEqual([{ type: "italic" }]);
  });

  it("unwraps tables but keeps their text", () => {
    const clean = sanitizeDoc(doc({ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [p("cell")] }] }] }));
    expect(JSON.stringify(clean)).toContain("cell");
    expect(JSON.stringify(clean)).not.toContain("table");
  });

  it("strips dangerous link protocols but keeps the text", () => {
    for (const href of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "data:text/html,<script>", "vbscript:x", "//evil.test", "/\\evil.test"]) {
      const { html } = renderRichText(doc(p("click", [{ type: "link", attrs: { href } }])));
      expect(html, href).not.toContain("<a");
      expect(html).toContain("click");
    }
  });

  it("keeps safe links; external ones open safely", () => {
    const { html } = renderRichText(doc(p("a", [{ type: "link", attrs: { href: "https://example.com/x", target: "_self", onclick: "x" } }]), p("b", [{ type: "link", attrs: { href: "/pricing" } }])));
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain("onclick");
  });

  it("only allows CMS-hosted images and requires alt text", () => {
    const external = sanitizeDoc(doc({ type: "image", attrs: { src: "https://evil.test/x.png", alt: "x" } }));
    expect(JSON.stringify(external)).not.toContain("image");
    const dataUri = sanitizeDoc(doc({ type: "image", attrs: { src: "data:image/png;base64,AAAA", alt: "x" } }));
    expect(JSON.stringify(dataUri)).not.toContain("image");

    expect(() => renderRichText(doc({ type: "image", attrs: { src: "/media/cabc1234567890", alt: "" } }))).toThrow(CmsError);
    const { html } = renderRichText(doc({ type: "image", attrs: { src: "/media/cabc1234567890", alt: 'A "chart"', onerror: "x" } }));
    expect(html).toContain('src="/media/cabc1234567890"');
    expect(html).toContain('alt="A &quot;chart&quot;"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain("onerror");
  });

  it("demotes H1 (reserved for the page title) and clamps heading levels", () => {
    const { html } = renderRichText(doc({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "a" }] }, { type: "heading", attrs: { level: 6 }, content: [{ type: "text", text: "b" }] }));
    expect(html).toContain("<h2>a</h2>");
    expect(html).toContain("<h4>b</h4>");
    expect(html).not.toContain("<h1");
  });

  it("repairs broken structure instead of throwing", () => {
    const { html } = renderRichText({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "text", text: "loose" }] }] }, { type: "text", text: "stray" }] });
    expect(html).toContain("<li><p>loose</p></li>");
    expect(html).not.toContain("stray");
  });

  it("handles garbage input", () => {
    for (const bad of [null, undefined, "x", 42, [], { type: "doc", content: "nope" }, { type: "doc", content: [null, 1, "s"] }]) {
      expect(() => renderRichText(bad)).not.toThrow();
    }
  });

  it("limits nesting depth", () => {
    let node: Record<string, unknown> = p("deep");
    for (let i = 0; i < 40; i++) node = { type: "blockquote", content: [node] };
    const issues: { code: string }[] = [];
    sanitizeDoc(doc(node), issues as never);
    expect(issues.some((i) => i.code === "too_deep")).toBe(true);
  });

  it("safeHref allow-list", () => {
    expect(safeHref("https://a.com")).toBe("https://a.com/");
    expect(safeHref("mailto:hi@upayaind.com")).toBe("mailto:hi@upayaind.com");
    expect(safeHref("/legal/terms")).toBe("/legal/terms");
    expect(safeHref("ftp://x.com")).toBeNull();
    expect(safeHref("java\u0000script:x")).toBeNull();
  });

  it("video embeds: YouTube (no-cookie) and Vimeo only", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
    expect(videoEmbedUrl("https://evil.test/embed/x")).toBeNull();
    expect(videoEmbedUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("slug rules", () => {
  it("accepts lowercase words separated by single hyphens", () => {
    for (const s of ["a", "faq-1", "h1b-opt", "my-first-post-2026"]) expect(slugSchema.safeParse(s).success, s).toBe(true);
  });
  it("rejects everything else", () => {
    for (const s of ["", "A", "with space", "-lead", "trail-", "double--dash", "under_score", "café", "a/b", "x".repeat(81)]) expect(slugSchema.safeParse(s).success, s).toBe(false);
  });
  it("toSlug produces valid slugs", () => {
    expect(toSlug("  H1B & OPT Candidates! ")).toBe("h1b-and-opt-candidates");
    expect(toSlug("Café — résumé tips")).toBe("cafe-resume-tips");
    expect(slugSchema.safeParse(toSlug("x".repeat(100) + " y")).success).toBe(true);
  });
});

describe("revisions", () => {
  const rev = (i: number): Revision => ({ at: new Date(2026, 0, i).toISOString(), by: null, title: `v${i}`, slug: "s", excerpt: null, body: {}, seoTitle: null, seoDescription: null, ogImageKey: null, canonicalUrl: null, noindex: false, sortOrder: 0, fields: null });

  it("pushRevision keeps newest first and caps at 20", () => {
    let list: Revision[] = [];
    for (let i = 1; i <= 25; i++) list = pushRevision(list, rev(i));
    expect(list).toHaveLength(MAX_REVISIONS);
    expect(list[0]!.title).toBe("v25");
    expect(list.at(-1)!.title).toBe("v6");
  });

  it("splitData separates fields from revisions", () => {
    expect(splitData({ studentName: "A", revisions: [rev(1)] })).toEqual({ fields: { studentName: "A" }, revisions: [rev(1)] });
    expect(splitData(null)).toEqual({ fields: null, revisions: [] });
  });
});

describe("CMS service (DB)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("saves, keeps at most 20 revisions, and restores", async () => {
    const a = await admin();
    const created = await saveEntry(a, { kind: "BLOG", title: "First", slug: "post", body: doc(p("v0")) });
    for (let i = 1; i <= 24; i++) await saveEntry(a, { id: created.id, kind: "BLOG", title: `Title ${i}`, slug: "post", body: doc(p(`v${i}`)) });
    const row = await db.cmsEntry.findUniqueOrThrow({ where: { id: created.id }, select: { data: true, bodyHtml: true, title: true } });
    const { revisions } = splitData(row.data);
    expect(revisions).toHaveLength(MAX_REVISIONS);
    expect(revisions[0]!.title).toBe("Title 23");
    expect(revisions[0]!.by).toBe("Ada Admin");
    expect(row.bodyHtml).toBe("<p>v24</p>");

    await restoreRevision(a, created.id, 0);
    const after = await db.cmsEntry.findUniqueOrThrow({ where: { id: created.id }, select: { title: true, bodyHtml: true, data: true } });
    expect(after.title).toBe("Title 23");
    expect(after.bodyHtml).toBe("<p>v23</p>");
    expect(splitData(after.data).revisions[0]!.title).toBe("Title 24");
    expect(splitData(after.data).revisions).toHaveLength(MAX_REVISIONS);
  });

  it("never stores client HTML — bodyHtml is generated from JSON", async () => {
    const a = await admin();
    const e = await saveEntry(a, { kind: "PAGE", title: "About", slug: "about", body: doc(p("ok")), ...({ bodyHtml: "<script>x</script>" } as object) });
    const row = await db.cmsEntry.findUniqueOrThrow({ where: { id: e.id }, select: { bodyHtml: true } });
    expect(row.bodyHtml).toBe("<p>ok</p>");
  });

  it("rejects duplicate and invalid slugs, enforces legal slugs", async () => {
    const a = await admin();
    await saveEntry(a, { kind: "BLOG", title: "One", slug: "same", body: doc(p("x")) });
    await expect(saveEntry(a, { kind: "BLOG", title: "Two", slug: "same", body: doc(p("x")) })).rejects.toThrow(/already uses this slug/);
    await expect(saveEntry(a, { kind: "BLOG", title: "Bad", slug: "Bad Slug", body: doc(p("x")) })).rejects.toThrow();
    // Same slug in another kind is fine.
    await expect(saveEntry(a, { kind: "LANDING", title: "Two", slug: "same", body: doc(p("x")) })).resolves.toBeTruthy();
    await expect(saveEntry(a, { kind: "LEGAL", title: "Other", slug: "imprint", body: doc(p("x")) })).rejects.toThrow(/Legal pages/);
  });

  it("frees the slug of a soft-deleted entry", async () => {
    const a = await admin();
    const first = await saveEntry(a, { kind: "BLOG", title: "Old", slug: "reuse", body: doc(p("x")) });
    await softDelete(a, first.id);
    const second = await saveEntry(a, { kind: "BLOG", title: "New", slug: "reuse", body: doc(p("y")) });
    expect(second.slug).toBe("reuse");
    const old = await db.cmsEntry.findUniqueOrThrow({ where: { id: first.id }, select: { deletedAt: true, isPublished: true } });
    expect(old.deletedAt).not.toBeNull();
    expect(old.isPublished).toBe(false);
  });

  it("validates STORY data and blocks publishing placeholders", async () => {
    const a = await admin();
    await expect(saveEntry(a, { kind: "STORY", title: "Story", slug: "s", body: doc(p("x")), fields: { studentName: "", role: "r", company: "c", quote: "q" } })).rejects.toThrow(/student's name/);
    const s = await saveEntry(a, { kind: "STORY", title: "[Student name]", slug: "s", body: doc(p("x")), fields: { studentName: "[Student name]", role: "Analyst", company: "Acme", quote: "[Student quote]" } });
    await expect(setPublished(a, s.id, true)).rejects.toThrow(/placeholders/);
    await saveEntry(a, { id: s.id, kind: "STORY", title: "Maya's story", slug: "s", body: doc(p("Story")), fields: { studentName: "Maya R.", role: "Analyst", company: "Acme", quote: "It worked.", weeksToOffer: "6", applicationsSent: 410 } });
    await setPublished(a, s.id, true);
    const row = await db.cmsEntry.findUniqueOrThrow({ where: { id: s.id }, select: { isPublished: true, publishedAt: true, data: true } });
    expect(row.isPublished).toBe(true);
    expect(row.publishedAt).not.toBeNull();
    expect(splitData(row.data).fields).toMatchObject({ weeksToOffer: 6, applicationsSent: 410 });
  });

  it("blocks publishing [DRAFT] legal text", async () => {
    const a = await admin();
    const e = await saveEntry(a, { kind: "LEGAL", title: "Privacy Policy", slug: "privacy", body: doc(p("[DRAFT — final text to come]")) });
    await expect(setPublished(a, e.id, true)).rejects.toThrow(/DRAFT/);
  });

  it("proof-strip counters only count real activity", async () => {
    expect(await computePublicStats()).toMatchObject({ students: 0, applications: 0, interviews: 0 });
  });
});
