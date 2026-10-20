import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";

/** Client IP + user agent of the current request (best effort behind Vercel/proxies). */
export async function requestMeta() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0]!.trim() : null) ?? h.get("x-real-ip") ?? null;
  return { ip, userAgent: h.get("user-agent"), country: h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") };
}

// ───────────────────────────── Request id ─────────────────────────────

/**
 * Request correlation id (DECISIONS D-131). Resolution order:
 * 1. an id set with `withRequestId()` (jobs, scripts, tests)
 * 2. the incoming `x-request-id` header (set by the proxy or middleware)
 * 3. Vercel's `x-vercel-id`
 * 4. a generated id, memoised per request via the header store
 */
const store = new AsyncLocalStorage<{ id: string }>();
const generated = new WeakMap<object, string>();

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{4,128}$/;

export function newRequestId() {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/** Run `fn` with a fixed request id (background jobs, CLI scripts). */
export function withRequestId<T>(id: string, fn: () => T): T {
  return store.run({ id }, fn);
}

/** Synchronous variant: only the ALS value (no header access). */
export function currentRequestId(): string | undefined {
  return store.getStore()?.id;
}

/** The current request's correlation id, or `undefined` outside a request (no store, no headers). */
export async function getRequestId(): Promise<string | undefined> {
  const fromStore = store.getStore()?.id;
  if (fromStore) return fromStore;
  let h: Awaited<ReturnType<typeof headers>>;
  try {
    h = await headers();
  } catch {
    return undefined; // not inside a request (job, script)
  }
  const incoming = h.get("x-request-id") ?? h.get("x-vercel-id");
  if (incoming && REQUEST_ID_RE.test(incoming)) return incoming;
  const cached = generated.get(h);
  if (cached) return cached;
  const id = newRequestId();
  generated.set(h, id);
  return id;
}
