import "server-only";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { open, seal } from "@/server/crypto";

const ISSUER = "UpayaInd";

export function newTotpSecret() {
  const secret = generateSecret();
  return { secret, sealed: seal(secret) };
}

export async function totpQrDataUrl(email: string, secret: string) {
  const uri = generateURI({ issuer: ISSUER, label: email, secret });
  return { uri, dataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: "#0B1846", light: "#FFFFFF" } }) };
}

/** Verify a 6-digit code against a sealed secret, allowing ±1 step of clock drift. */
export function verifyTotp(sealedSecret: string | null | undefined, token: string): boolean {
  if (!sealedSecret) return false;
  const clean = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  try {
    const secret = open(sealedSecret);
    const result = verifySync({ secret, token: clean, epochTolerance: 30 }) as unknown;
    if (typeof result === "boolean") return result;
    return Boolean((result as { valid?: boolean })?.valid);
  } catch {
    return false;
  }
}
