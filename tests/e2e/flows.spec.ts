import { expect, test } from "@playwright/test";

/**
 * F1 end to end in dev/test mode (no Stripe keys): pricing → signup → checkout →
 * simulated webhook → onboarding. Activation happens only via the webhook path.
 */
test("F1: a visitor signs up, pays and lands in onboarding", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e.${Date.now()}@example.com`;
  await page.goto("/pricing");
  const choose = page.locator("a[data-plan-id]:visible").first();
  await expect(choose).toBeVisible();
  await choose.click();
  await expect(page).toHaveURL(/\/signup\?plan=/);

  await page.fill("#name", "E2E Student");
  await page.fill("#email", email);
  await page.fill("#password", "correct horse battery staple 42");
  await page.fill("#phone", "+1 415 555 0142");
  await page.check("input[name=consentTerms]");
  await page.check("input[name=consentApply]");
  await page.check("input[name=consentAgreement]");
  await page.click("form button[type=submit]");

  await expect(page).toHaveURL(/\/app\/checkout\?plan=/, { timeout: 60_000 });
  await page.getByRole("button", { name: /continue to secure payment/i }).click();
  await page.getByRole("button", { name: /simulate/i }).click();
  await expect(page).toHaveURL(/\/app\/onboarding/, { timeout: 60_000 });

  await page.goto("/app/billing");
  await expect(page.locator("main")).toContainText(/active/i);
});

test("public pages render with one H1 and a description", async ({ page }) => {
  for (const p of ["/", "/in", "/uk", "/pricing", "/how-it-works", "/faq", "/contact", "/success-stories", "/blog", "/about"]) {
    await page.goto(p);
    await expect(page.locator("h1"), p).toHaveCount(1);
    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    expect(desc?.length ?? 0, p).toBeGreaterThan(20);
    expect(desc!.length, p).toBeLessThanOrEqual(155);
    expect((await page.title()).length, p).toBeLessThanOrEqual(60);
  }
});
