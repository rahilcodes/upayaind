import { absoluteUrl } from "@/lib/utils";

/** <script type="application/ld+json"> with `<` escaped so content can't close the tag. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export const ORG_ID = absoluteUrl("/#organization");

export const SITE_ID = absoluteUrl("/#website");

/** ISO 3166 code for schema.org `areaServed` / `eligibleRegion` (our "UK" is ISO "GB"). */
export const isoCountry = (code: string) => (code === "UK" ? "GB" : code);

export function organizationLd(opts: { phones: { phone: string; country: string }[]; email?: string; addresses?: string[]; sameAs?: string[]; countries?: string[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: "UpayaInd",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon"),
    description: "Done-for-you job applications, with a resume tailored to every role.",
    ...(opts.sameAs?.length ? { sameAs: opts.sameAs } : {}),
    ...(opts.countries?.length ? { areaServed: opts.countries.map((c) => ({ "@type": "Country", name: c })) } : {}),
    ...(opts.email ? { email: opts.email } : {}),
    ...(opts.addresses?.length ? { address: opts.addresses.length === 1 ? opts.addresses[0] : opts.addresses } : {}),
    ...(opts.phones.length
      ? {
          contactPoint: opts.phones.map((p) => ({
            "@type": "ContactPoint",
            telephone: p.phone,
            contactType: "customer service",
            areaServed: isoCountry(p.country),
            availableLanguage: ["English"],
          })),
        }
      : {}),
  };
}

export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

/** Site-level entity: ties every page to one named website and its publisher (D-172). */
export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    name: "UpayaInd",
    alternateName: ["Upaya Ind", "UpayaInd job application service"],
    url: absoluteUrl("/"),
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
  };
}

type OfferPlan = { name: string; prices: { id: string; interval: string; amountMinor: number; currency: string; dailyTarget: number; purchasable: boolean }[] };

/**
 * Service + one Offer per purchasable price (SPEC §6.1). `markets` is every market on the page:
 * all of them on /pricing, one on a country page, so each country page carries only its own currency.
 */
export function serviceLd(markets: { market: { code: string; name: string }; plans: OfferPlan[] }[], opts: { path: string }) {
  const offers = markets.flatMap((p) =>
    p.plans.flatMap((plan) =>
      plan.prices
        .filter((x) => x.purchasable)
        .map((x) => ({
          "@type": "Offer",
          name: `${plan.name} (${x.interval.toLowerCase().replace("_", "-")})`,
          price: (x.amountMinor / 100).toFixed(2),
          priceCurrency: x.currency,
          eligibleRegion: { "@type": "Country", name: p.market.name, identifier: isoCountry(p.market.code) },
          availability: "https://schema.org/InStock",
          url: absoluteUrl(`/signup?plan=${x.id}`),
          description: `${x.dailyTarget} tailored applications every weekday`,
        })),
    ),
  );
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": absoluteUrl(`${opts.path}#service`),
    name: markets.length === 1 ? `UpayaInd done-for-you job applications in ${markets[0]!.market.name}` : "UpayaInd done-for-you job applications",
    serviceType: "Job application service",
    description: "Specialists apply to jobs for you every weekday, each with a resume tailored to the job description. Track every application live.",
    url: absoluteUrl(opts.path),
    provider: { "@id": ORG_ID },
    areaServed: markets.map((p) => ({ "@type": "Country", name: p.market.name, identifier: isoCountry(p.market.code) })),
    ...(offers.length ? { offers } : {}),
  };
}
