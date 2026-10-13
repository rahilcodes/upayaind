/**
 * "View as student" token (SPEC P1 read-only impersonation, D-120).
 *
 * The admin keeps their own session; a short-lived, HMAC-signed `viewas`
 * cookie says "this ADMIN is looking at this student". Edge-safe (Web Crypto
 * only) so the middleware and the Node server share one implementation.
 *
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload)).
 */

export const VIEW_AS_COOKIE = "viewas";
export const VIEW_AS_MINUTES = 30;

export type ViewAsPayload = {
  /** The admin's User id (must equal the session user). */
  adminId: string;
  /** The StudentProfile id being viewed. */
  studentId: string;
  /** The student's User id. */
  studentUserId: string;
  /** Unix ms expiry. */
  exp: number;
};

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string | null {
  try {
    const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
    return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  } catch {
    return null;
  }
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(`viewas:${data}`)));
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signViewAs(secret: string, payload: ViewAsPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}

/** Returns the payload when the signature is valid and it hasn't expired; otherwise null. */
export async function verifyViewAs(secret: string, token: string | undefined | null, now = Date.now()): Promise<ViewAsPayload | null> {
  if (!token || typeof token !== "string" || token.length > 2048) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!mac) return null;
  const expected = await hmac(secret, body);
  if (!constantTimeEqual(expected, mac)) return null;
  const json = fromB64url(body);
  if (!json) return null;
  let p: unknown;
  try {
    p = JSON.parse(json);
  } catch {
    return null;
  }
  if (!p || typeof p !== "object") return null;
  const { adminId, studentId, studentUserId, exp } = p as Record<string, unknown>;
  if (typeof adminId !== "string" || typeof studentId !== "string" || typeof studentUserId !== "string" || typeof exp !== "number") return null;
  if (!(exp > now)) return null;
  return { adminId, studentId, studentUserId, exp };
}
