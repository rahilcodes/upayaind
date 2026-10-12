import "server-only";
import { hash, verify } from "@node-rs/argon2";

/** argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1). */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 /* Argon2id */ } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashed: string | null | undefined, password: string): Promise<boolean> {
  if (!hashed) return false;
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** A dummy hash so failed lookups take as long as real checks (no user enumeration by timing). */
let dummy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummy ??= hash("not-a-real-password", OPTIONS);
  await verifyPassword(await dummy, password);
}
