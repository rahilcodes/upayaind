import "server-only";
import { z } from "zod";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { emailSchema } from "@/lib/schemas/auth";
import { enforceRateLimit } from "./ratelimit";
import { sendEmail } from "./email";
import { notifyManagers } from "./notify";
import { trackEvent } from "./events";

/**
 * Leads from the public site (SPEC §6.4 contact form). This module only
 * CREATES leads; the /admin/leads inbox lives elsewhere.
 */

/** Dialling prefixes offered next to the phone field (ISO → +code). */
export const DIAL_CODES: Record<string, { cc: CountryCode; dial: string }> = {
  US: { cc: "US", dial: "+1" },
  CA: { cc: "CA", dial: "+1" },
  UK: { cc: "GB", dial: "+44" },
  AU: { cc: "AU", dial: "+61" },
  IN: { cc: "IN", dial: "+91" },
};

export const contactSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name").max(120, "Use at most 120 characters"),
    email: emailSchema,
    phoneCountry: z.string().trim().max(2).optional().default(""),
    phone: z.string().trim().max(32, "That phone number is too long").optional().default(""),
    market: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Choose your country"),
    message: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(4000, "Use at most 4,000 characters"),
    consent: z.literal("on", { message: "Please agree so we can contact you" }),
    website: z.string().optional().default(""), // honeypot
    utm: z.string().max(1000).optional().default(""),
  })
  .transform((v, ctx) => {
    let phone: string | null = null;
    if (v.phone) {
      const cc = DIAL_CODES[v.phoneCountry || v.market]?.cc;
      const n = parsePhoneNumberFromString(v.phone, cc);
      if (!n || !n.isValid()) {
        ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a valid phone number (with country code)" });
        return z.NEVER;
      }
      phone = n.number as string;
    }
    return { ...v, phone };
  });

export type ContactInput = z.input<typeof contactSchema>;

function parseUtm(raw: string): Record<string, string> | null {
  if (!raw) return null;
  try {
    const p = new URLSearchParams(raw);
    const out: Record<string, string> = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref"]) {
      const v = p.get(k);
      if (v) out[k] = v.slice(0, 120);
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/**
 * Contact form → Lead + auto-reply + manager notification.
 * Rate limited to 5/hour per IP (SPEC §10). A filled honeypot silently "succeeds".
 */
export async function submitContact(raw: ContactInput, meta: { ip: string | null }) {
  const input = contactSchema.parse(raw);
  await enforceRateLimit("contact", meta.ip ?? "unknown");
  if (input.website) return { id: null, spam: true as const };

  const lead = await db.lead.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      marketCode: input.market,
      source: "CONTACT_FORM",
      message: input.message,
      utm: (parseUtm(input.utm) ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    select: { id: true },
  });

  const first = input.name.split(/\s+/)[0] ?? input.name;
  await Promise.allSettled([
    sendEmail({
      to: input.email,
      subject: "We’ve got your message — UpayaInd",
      content: {
        preview: "Thanks for getting in touch. A member of our team will reply soon.",
        heading: `Thanks, ${first}. We’ve got your message.`,
        paragraphs: [
          "A member of the UpayaInd team will reply to this email, usually within one working day.",
          "In the meantime, you can see exactly how we apply for you and what each plan includes on our website.",
        ],
        cta: { label: "See how it works", href: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/how-it-works` },
        footnote: "You received this email because you sent us a message through upayaind.com.",
      },
    }),
    notifyManagers("new_lead", { name: input.name, email: input.email, source: "Contact form", message: input.message.slice(0, 200) }),
    trackEvent("contact_submitted", null, { leadId: lead.id, market: input.market }),
  ]);

  return { id: lead.id, spam: false as const };
}
