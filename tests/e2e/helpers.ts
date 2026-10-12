import { expect, type Page } from "@playwright/test";
import { generateSync } from "otplib";

export const PASSWORD = "Upaya!Demo-2026";
export const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
export const USERS = {
  student: "student@upayaind.test",
  employee: "arjun@upayaind.test",
  manager: "manager@upayaind.test",
  admin: "admin@upayaind.test",
} as const;

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("form button[type=submit]");
  await page.waitForURL(/\/(2fa|app|work|admin|pricing)/);
  if (page.url().includes("/2fa")) {
    // Avoid reusing a code from the same 30 s window as a previous test.
    await page.fill("#code", generateSync({ secret: TOTP_SECRET }));
    await page.click("form button[type=submit]");
    await page.waitForURL(/\/(work|admin)/);
  }
}

/** Fields that must never reach a browser (SPEC §10, §19). */
export const SECRET_PATTERNS = [/passwordHash/, /totpSecretEnc/, /usernameEnc/, /passwordEnc/, /notesEnc/, /"v1\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./];

export async function expectNoSecrets(body: string, where: string) {
  for (const re of SECRET_PATTERNS) expect(body, `${where} leaks ${re}`).not.toMatch(re);
}

export const authState = (role: keyof typeof USERS) => `tests/e2e/.auth/${role}.json`;
