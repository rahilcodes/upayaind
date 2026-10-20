import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters");

/** Phone in E.164 (SPEC F1). `country` is the ISO code used to parse national formats. */
export function phoneSchema(defaultCountry = "US") {
  return z
    .string()
    .trim()
    .min(5, "Enter a phone number")
    .transform((v, ctx) => {
      const n = parsePhoneNumberFromString(v, defaultCountry === "UK" ? "GB" : (defaultCountry as never));
      if (!n || !n.isValid()) {
        ctx.addIssue({ code: "custom", message: "Enter a valid phone number with country code" });
        return z.NEVER;
      }
      return n.number as string;
    });
}

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().trim().min(5, "Enter a phone number").max(32),
  market: z.string().trim().length(2),
  consentTerms: z.literal("on", { message: "Please accept the Terms and Privacy Policy" }),
  consentApply: z.literal("on", { message: "Please authorise us to apply on your behalf" }),
  // Placement agreement (D-138): the fee due once the student accepts an offer. Sign-up cannot complete without it.
  consentAgreement: z.literal("on", { message: "Please accept the Placement Agreement" }),
  plan: z.string().optional(),
  timezone: z.string().max(64).optional(),
  ref: z.string().trim().max(20).optional(),
});

export const completeProfileSchema = signupSchema.pick({ phone: true, market: true, consentTerms: true, consentApply: true, consentAgreement: true, plan: true, timezone: true, ref: true });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(256),
  next: z.string().optional(),
});

export const forgotSchema = z.object({ email: emailSchema });

export const magicLinkSchema = z.object({ email: emailSchema, next: z.string().max(500).optional() });

export const resetSchema = z
  .object({ token: z.string().min(10), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export const totpSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });
/** One-time 2FA backup code: 8 letters/digits, dashes and spaces ignored (D-123). */
export const backupCodeSchema = z.object({
  backupCode: z
    .string()
    .trim()
    .transform((v) => v.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .pipe(z.string().length(8, "Enter one of your 8-character backup codes")),
});

export const CONSENT_VERSION = "2026-10-15"; // bumped for the Placement Agreement (D-138)
