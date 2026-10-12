import { z } from "zod";

/**
 * Environment validation (SPEC §14). Imported by server code at boot so a
 * misconfigured deployment fails fast with a readable error.
 *
 * Core variables are always required. Third-party integrations are required in
 * production; in development and test each one falls back to a safe local
 * implementation (console email, local-disk files, in-memory rate limits, AI
 * and payments disabled with a clear error). See docs/DECISIONS.md D-004.
 */

const isProd = process.env.NODE_ENV === "production" && process.env.SKIP_ENV_STRICT !== "1";

const optionalInDev = (schema: z.ZodString = z.string().min(1)) =>
  isProd ? schema : schema.optional().or(z.literal("").transform(() => undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  VAULT_MASTER_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "VAULT_MASTER_KEY must be 32 bytes, base64-encoded"),

  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  R2_ACCOUNT_ID: optionalInDev(),
  R2_ACCESS_KEY_ID: optionalInDev(),
  R2_SECRET_ACCESS_KEY: optionalInDev(),
  R2_BUCKET: optionalInDev(),

  ANTHROPIC_API_KEY: optionalInDev(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  ANTHROPIC_MODEL_FAST: z.string().optional(),

  STRIPE_SECRET_KEY: optionalInDev(),
  STRIPE_WEBHOOK_SECRET: optionalInDev(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  RESEND_API_KEY: optionalInDev(),
  EMAIL_FROM: z.string().default("UpayaInd <hello@upayaind.com>"),

  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  UPSTASH_REDIS_REST_URL: optionalInDev(z.string().url()),
  UPSTASH_REDIS_REST_TOKEN: optionalInDev(),

  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_GA_ID: z.string().optional(),
  NEXT_PUBLIC_CLARITY_ID: z.string().optional(),
  CALCOM_LINK: z.string().optional(),
});

function parse() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}\nSee .env.example and docs/SPEC.md §14.`);
  }
  return parsed.data;
}

export const env = parse();
export type Env = typeof env;

export const integrations = {
  storage: Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET),
  ai: Boolean(env.ANTHROPIC_API_KEY),
  stripe: Boolean(env.STRIPE_SECRET_KEY),
  email: Boolean(env.RESEND_API_KEY),
  redis: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
  google: Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET),
  inngest: Boolean(env.INNGEST_EVENT_KEY),
};
