import { absoluteUrl } from "@/lib/utils";

/**
 * llms.txt (https://llmstxt.org) — a short, plain-text guide to the public site
 * for AI crawlers and assistants (DECISIONS D-134). Static.
 */
export const dynamic = "force-static";

export function GET() {
  const u = (p: string) => absoluteUrl(p);
  const body = `# UpayaInd

> UpayaInd is a done-for-you job application service (sometimes called a reverse recruiter) for job seekers in the United States, India, the United Kingdom, Canada, Australia and New Zealand. Our specialists apply to 25–50 jobs for you every weekday, each with a resume tailored to the job, and you track every application live in your dashboard.

## How it works

- [How it works](${u("/how-it-works")}): onboarding, daily applications, tailored resumes, live tracking.
- [Pricing](${u("/pricing")}): plans with a daily application target. Each country has its own page and currency.
- [Success stories](${u("/success-stories")}): verified outcomes from students who found roles through UpayaInd.
- [FAQ](${u("/faq")}): common questions on eligibility, guarantees and data handling.
- [About](${u("/about")}): the team and the mission.

## Countries

- [United States](${u("/")}) · [pricing in USD](${u("/pricing")}): OPT, H-1B, green card holders and citizens; one-page US resume.
- [India](${u("/in")}) · [pricing in INR](${u("/in/pricing")}): freshers and experienced professionals; Naukri, LinkedIn, Indeed.
- [United Kingdom](${u("/uk")}) · [pricing in GBP](${u("/uk/pricing")}): Graduate and Skilled Worker visa holders, residents and citizens; two-page UK CV.
- [Canada](${u("/ca")}) · [pricing in CAD](${u("/ca/pricing")}): PGWP holders, permanent residents and citizens; Canadian resume.
- [Australia](${u("/au")}) · [pricing in AUD](${u("/au/pricing")}): 485 and skilled visa holders, residents and citizens; Australian resume.
- [New Zealand](${u("/nz")}) · [pricing in NZD](${u("/nz/pricing")}): post-study and AEWV visa holders, residents and citizens; NZ CV.

## Blog

- [Blog](${u("/blog")}): practical advice on resumes, applications and interviews, including resume and CV format guides for each country.
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
