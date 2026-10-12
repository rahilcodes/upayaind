import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import { login, USERS } from "./helpers";

/** Log in once per role and reuse the session (keeps us under the login rate limit, SPEC §10). */
export default async function globalSetup(config: FullConfig) {
  const use = config.projects[0]!.use;
  fs.mkdirSync("tests/e2e/.auth", { recursive: true });
  const browser = await chromium.launch(use.launchOptions);
  for (const [role, email] of Object.entries(USERS)) {
    const page = await browser.newPage({ baseURL: use.baseURL });
    await login(page, email);
    await page.context().storageState({ path: `tests/e2e/.auth/${role}.json` });
    await page.close();
  }
  await browser.close();
}
