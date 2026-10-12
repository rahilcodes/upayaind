import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { authState } from "./helpers";

async function scan(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const msg = serious.map((v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(msg, where).toEqual([]);
}

const PAGES = {
  public: ["/", "/pricing", "/how-it-works", "/faq", "/contact", "/login", "/signup"],
  student: ["/app", "/app/applications", "/app/interviews", "/app/vault", "/app/messages", "/app/billing"],
  employee: ["/work", "/work/students", "/work/timesheet", "/work/leave", "/work/messages"],
  admin: ["/admin", "/admin/students", "/admin/assignments", "/admin/reports", "/admin/employees"],
} as const;

for (const [group, pages] of Object.entries(PAGES)) {
  test.describe(`a11y: ${group}`, () => {
    if (group !== "public") test.use({ storageState: authState(group as "student") });
    for (const p of pages) {
      test(`${p} has no serious WCAG 2.2 AA violations`, async ({ page }) => {
        await page.goto(p);
        await scan(page, p);
      });
    }
  });
}
