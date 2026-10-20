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

export function organizationLd(opts: { phones: { phone: string; country: string }[]; email?: string; address?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: "UpayaInd",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon"),
    description: "Done-for-you job applications, with a resume tailored to every role.",
    ...(opts.email ? { email: opts.email } : {}),
    ...(opts.address ? { address: opts.address } : {}),
    ...(opts.phones.length
      ? {
          contactPoint: opts.phones.map((p) => ({
            "@type": "ContactPoint",
            telephone: p.phone,
            contactType: "customer service",
            areaServed: p.country === "UK" ? "GB" : p.country,
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
