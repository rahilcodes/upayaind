import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Envelope encryption (SPEC §10): every value gets its own random 256-bit data
 * key; the data key is encrypted with the master key (VAULT_MASTER_KEY). Both
 * layers use AES-256-GCM. Format (base64url parts):
 *   v1.<dekIv>.<encryptedDek+tag>.<iv>.<ciphertext+tag>
 * Rotating the master key only requires re-wrapping data keys.
 */

const VERSION = "v1";

function masterKey(): Buffer {
  return Buffer.from(env.VAULT_MASTER_KEY, "base64");
}

function gcmEncrypt(key: Buffer, plaintext: Buffer): { iv: Buffer; data: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return { iv, data: enc };
}

function gcmDecrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const tag = data.subarray(data.length - 16);
  const body = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function seal(plaintext: string): string {
  const dek = randomBytes(32);
  const wrapped = gcmEncrypt(masterKey(), dek);
  const sealed = gcmEncrypt(dek, Buffer.from(plaintext, "utf8"));
  dek.fill(0);
  return [VERSION, wrapped.iv, wrapped.data, sealed.iv, sealed.data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function open(sealed: string): string {
  const [version, dekIv, dekData, iv, data] = sealed.split(".");
  if (version !== VERSION || !dekIv || !dekData || !iv || !data) throw new Error("Unsupported ciphertext format");
  const dek = gcmDecrypt(masterKey(), Buffer.from(dekIv, "base64url"), Buffer.from(dekData, "base64url"));
  try {
    return gcmDecrypt(dek, Buffer.from(iv, "base64url"), Buffer.from(data, "base64url")).toString("utf8");
  } finally {
    dek.fill(0);
  }
}

export function sealOptional(v: string | null | undefined): string | null {
  return v ? seal(v) : null;
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** URL-safe random token (default 32 bytes). Store only `sha256(token)`. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
