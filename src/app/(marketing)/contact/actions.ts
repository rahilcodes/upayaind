"use server";
import { z } from "zod";
import { requestMeta } from "@/server/request";
import { RateLimitError } from "@/server/services/ratelimit";
import { submitContact, type ContactInput } from "@/server/services/leads";

export type ContactState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

/** Public contact form (no auth — it's the pre-sales site). Validated with zod, rate limited per IP. */
export async function contactAction(_prev: ContactState, form: FormData): Promise<ContactState> {
  const values = Object.fromEntries(["name", "email", "phone", "phoneCountry", "market", "message", "consent", "website", "utm"].map((k) => [k, String(form.get(k) ?? "")]));
  try {
    const { ip } = await requestMeta();
    await submitContact(values as unknown as ContactInput, { ip });
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { error: e.issues[0]?.message ?? "Please check the form.", fieldErrors: z.flattenError(e).fieldErrors as Record<string, string[]>, values };
    }
    if (e instanceof RateLimitError) return { error: e.message, values };
    console.error("[contact] failed", e);
    return { error: "Something went wrong. Please try again, or email us directly.", values };
  }
}
