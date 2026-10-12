import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (SPEC M11). Runs against a production build seeded with demo data
 * (`pnpm db:seed` with SEED_DEMO_PRICES=1). In CI the browser comes from
 * `playwright install`; elsewhere set PW_CHROMIUM_PATH to a Chromium binary.
 */
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath, args: (process.env.PW_CHROMIUM_ARGS ?? "--no-sandbox --disable-gpu").split(" ") } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm start", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 120_000 },
});
