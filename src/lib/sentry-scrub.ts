/**
 * Sentry event scrubbing (SPEC §10, DECISIONS D-130). Shared by the client,
 * server and edge configs, so it must stay dependency-free and isomorphic.
 *
 * - Any key that ends in `Enc`, or looks like a password/secret/token/key/
 *   authorization/cookie, is replaced by "[Filtered]" wherever it appears in
 *   the event (extra, contexts, request data, breadcrumbs, tags).
 * - User context keeps only `id` and `role`; email, IP, username are dropped.
 */

export const SENSITIVE_KEY_RE = /(Enc$|^password|passwd|^pass$|secret|token|api[-_]?key|^key$|authorization|cookie|set-cookie|session|otp|totp|ssn|cardnumber|cvv)/i;

const MAX_DEPTH = 8;

export function isSensitiveKey(key: string) {
  return SENSITIVE_KEY_RE.test(key);
}

export function scrubValue<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? "[Filtered]" : scrubValue(v, depth + 1);
  }
  return out as T;
}

type UserLike = { id?: string | number; role?: string; [k: string]: unknown } | undefined | null;

/** Keep `id` + `role` only — never email, ip_address, username or segment. */
export function scrubUser(user: UserLike) {
  if (!user) return undefined;
  const out: { id?: string; role?: string } = {};
  if (user.id !== undefined && user.id !== null) out.id = String(user.id);
  if (typeof user.role === "string") out.role = user.role;
  return out;
}

/** Structural subset of a Sentry event (kept loose so this file has no @sentry type dependency). */
type EventLike = {
  user?: UserLike;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  request?: { data?: unknown; headers?: Record<string, string>; cookies?: unknown; query_string?: unknown };
  breadcrumbs?: { data?: Record<string, unknown> }[];
};

/** `beforeSend` / `beforeSendTransaction`: scrub in place and return the event. */
export function scrubEvent<E extends EventLike>(event: E): E {
  if (!event) return event;
  const e = event as EventLike;
  if (e.user !== undefined) e.user = scrubUser(e.user);
  if (e.extra) e.extra = scrubValue(e.extra);
  if (e.contexts) e.contexts = scrubValue(e.contexts);
  if (e.tags) e.tags = scrubValue(e.tags);
  if (e.request) {
    const r = e.request;
    if (r.data !== undefined) r.data = typeof r.data === "string" ? scrubString(r.data) : scrubValue(r.data);
    if (r.headers) r.headers = scrubValue(r.headers);
    if (r.cookies !== undefined) r.cookies = "[Filtered]";
    if (typeof r.query_string === "string") r.query_string = scrubString(r.query_string);
  }
  if (Array.isArray(e.breadcrumbs)) {
    for (const b of e.breadcrumbs) if (b?.data) b.data = scrubValue(b.data);
  }
  return event;
}

/** Best-effort for raw bodies / query strings: `token=abc` → `token=[Filtered]`; JSON bodies are parsed and scrubbed. */
export function scrubString(input: string) {
  const trimmed = input.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.stringify(scrubValue(JSON.parse(trimmed)));
    } catch {
      /* not JSON — fall through */
    }
  }
  return input.replace(/([?&]?)([A-Za-z0-9_\-[\]]+)=([^&\s]+)/g, (m, sep: string, k: string, v: string) =>
    isSensitiveKey(k) ? `${sep}${k}=[Filtered]` : `${sep}${k}=${v}`,
  );
}
