import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env, integrations } from "@/env";

/**
 * Rate limits (SPEC §10): login 10/15 min per IP+email, signup 5/hour per IP,
 * contact 5/hour per IP, AI generations per §9.4. Upstash in production; an
 * in-memory sliding window in development and tests.
 */

type Window = `${number} ${"s" | "m" | "h" | "d"}`;
export const LIMITS = {
  login: { tokens: 10, window: "15 m" },
  signup: { tokens: 5, window: "1 h" },
  contact: { tokens: 5, window: "1 h" },
  passwordReset: { tokens: 5, window: "1 h" },
  aiEmployee: { tokens: 60, window: "1 h" },
  aiStudent: { tokens: 300, window: "1 d" },
  upload: { tokens: 60, window: "1 h" },
  message: { tokens: 120, window: "1 h" },
} as const satisfies Record<string, { tokens: number; window: Window }>;
export type LimitName = keyof typeof LIMITS;

const redis = integrations.redis ? new Redis({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! }) : null;
const limiters = new Map<string, Ratelimit>();

function windowMs(w: Window) {
  const [n, unit] = w.split(" ") as [string, "s" | "m" | "h" | "d"];
  return Number(n) * { s: 1e3, m: 6e4, h: 3.6e6, d: 8.64e7 }[unit];
}

const memory = new Map<string, number[]>();

export async function rateLimit(name: LimitName, key: string, override?: { tokens: number }) {
  const cfg = { ...LIMITS[name], ...override };
  if (redis) {
    const id = `${name}:${cfg.tokens}`;
    let rl = limiters.get(id);
    if (!rl) {
      rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(cfg.tokens, cfg.window), prefix: `rl:${name}` });
      limiters.set(id, rl);
    }
    const r = await rl.limit(key);
    return { success: r.success, remaining: r.remaining, reset: r.reset };
  }
  const now = Date.now();
  const ms = windowMs(cfg.window);
  const k = `${name}:${key}`;
  const hits = (memory.get(k) ?? []).filter((t) => now - t < ms);
  if (hits.length >= cfg.tokens) {
    memory.set(k, hits);
    return { success: false, remaining: 0, reset: hits[0]! + ms };
  }
  hits.push(now);
  memory.set(k, hits);
  return { success: true, remaining: cfg.tokens - hits.length, reset: now + ms };
}

export class RateLimitError extends Error {
  constructor(message = "Too many attempts. Please wait a few minutes and try again.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export async function enforceRateLimit(name: LimitName, key: string, override?: { tokens: number }) {
  const r = await rateLimit(name, key, override);
  if (!r.success) throw new RateLimitError();
  return r;
}
