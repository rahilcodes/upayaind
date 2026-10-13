import { absoluteUrl } from "@/lib/utils";

/**
 * llms.txt (https://llmstxt.org) — a short, plain-text guide to the public site
 * for AI crawlers and assistants (DECISIONS D-134). Static.
 */
export const dynamic = "force-static";

export function GET() {
  const u = (p: string) => absoluteUrl(p);
  const body = `# UpayaInd

> UpayaInd is a done-for-you job application service. Our specialists apply to 25–50 jobs for you every weekday, each with a resume tailored to the job, and you track every application live in your dashboard.

## How it works

- [How it works](${u("/how-it-works")}): onboarding, daily applications, tailored resumes, live tracking.
- [Pricing](${u("/pricing")}): plans by market (US, UK, Canada, Australia, India) with a daily application target.
- [Success stories](${u("/success-stories")}): verified outcomes from students who found roles through UpayaInd.
- [FAQ](${u("/faq")}): common questions on eligibility, guarantees and data handling.
- [About](${u("/about")}): the team and the mission.

## Blog

- [Blog](${u("/blog")}): practical advice on resumes, applications and interviews.
- [RSS](${u("/blog/feed.xml")}) · [Atom](${u("/blog/atom.xml")})

## Policies

- [Privacy](${u("/legal/privacy")})
- [Terms](${u("/legal/terms")})
- [Refund policy](${u("/legal/refund")})
- [Security contact](${u("/.well-known/security.txt")})

## Notes

- Portals under /app, /work and /admin are private and must not be crawled.
- Contact: ${u("/contact")}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
