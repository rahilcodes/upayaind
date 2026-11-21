import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

import { LEGAL_PAGES, compileLegal } from "@/server/legal-pages";
import { LEGAL_SLUGS, renderRichText } from "@/server/services/cms";

describe("legal pages (D-170)", () => {
  it("covers every fixed legal slug exactly once", () => {
    expect([...LEGAL_PAGES.map((p) => p.slug)].sort()).toEqual([...LEGAL_SLUGS].sort());
  });

  it.each(LEGAL_PAGES.map((p) => [p.slug, p] as const))("%s compiles to a body the CMS editor and sanitizer accept unchanged", (_slug, page) => {
    const { body, bodyHtml } = compileLegal(page.text);
    const rendered = renderRichText(body);
    expect(rendered.issues).toEqual([]);
    expect(rendered.html).toBe(bodyHtml); // the seeded HTML is exactly what a CMS re-save would produce
    expect(bodyHtml).not.toMatch(/\[(DRAFT|placeholder)/i); // publishable (setPublished rejects drafts)
    expect(bodyHtml).not.toMatch(/\[[^\]]+\]/); // no bracketed terms left to fill in
    expect(bodyHtml).toContain("<h2>");
  });

  it("renders bold, links and lists, and refuses unsafe links", () => {
    const { bodyHtml, body } = compileLegal("# Title\nSee **this** and [terms](/legal/terms) or [mail](mailto:a@b.c).\n- one\n- two\n\n1. first\n2. second");
    expect(bodyHtml).toBe(
      '<h2>Title</h2><p>See <strong>this</strong> and <a href="/legal/terms">terms</a> or <a href="mailto:a@b.c">mail</a>.</p><ul><li><p>one</p></li><li><p>two</p></li></ul><ol><li><p>first</p></li><li><p>second</p></li></ol>',
    );
    expect(body.content[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(() => compileLegal("[x](https://evil.example)")).toThrow(/unsafe link/);
    expect(() => compileLegal("[x](javascript:alert(1))")).toThrow(/unsafe link/);
  });

  it("the agreement carries the enrolment terms from the client's PDF", () => {
    const html = compileLegal(LEGAL_PAGES.find((p) => p.slug === "agreement")!.text).bodyHtml;
    for (const s of ["8% to 12%", "3 equal monthly instalments", "USD 100", "Pennsylvania", "Erie, Pennsylvania", "all sales are final", "Promissory note", "United Kingdom", "Canada", "Australia", "New Zealand", "India"]) {
      expect(html).toContain(s);
    }
  });
});
