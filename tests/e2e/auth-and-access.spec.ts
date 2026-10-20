import { expect, test } from "@playwright/test";
import { authState, expectNoSecrets, PASSWORD, USERS } from "./helpers";

test.describe("anonymous", () => {
  test("portals redirect to login with next (SPEC §5)", async ({ page }) => {
    await page.goto("/work/students");
    await expect(page).toHaveURL(/\/login\?next=%2Fwork%2Fstudents/);
  });
  test("bad password shows an error and does not sign in", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "nobody@upayaind.test");
    await page.fill("#password", "definitely-wrong-123");
    await page.click("form button[type=submit]");
    await expect(page.getByRole("alert").filter({ hasText: /match|attempts/i })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
  test("staff are forced through 2FA before any portal", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", USERS.employee);
    await page.fill("#password", PASSWORD);
    await page.click("form button[type=submit]");
    await expect(page).toHaveURL(/\/2fa/);
    await page.goto("/work");
    await expect(page).toHaveURL(/\/2fa/);
  });
});

test.describe("student", () => {
  test.use({ storageState: authState("student") });
  test("lands on /app and is kept out of staff portals", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/app/);
    expect((await page.goto("/admin"))?.status()).toBe(403);
    expect((await page.goto("/work"))?.status()).toBe(403);
  });
});

test.describe("employee", () => {
  test.use({ storageState: authState("employee") });
  test("lands on /work and cannot open /app or /admin", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/work/);
    expect((await page.goto("/app"))?.status()).toBe(403);
    expect((await page.goto("/admin"))?.status()).toBe(403);
  });
  test("cannot open an unassigned student by URL (SPEC §19)", async ({ page }) => {
    const id = process.env.E2E_UNASSIGNED_STUDENT_ID;
    test.skip(!id, "Set E2E_UNASSIGNED_STUDENT_ID to a student not assigned to arjun");
    for (const p of [`/work/students/${id}`, `/work/students/${id}/apply`]) {
      await page.goto(p);
      await expect(page.locator("main")).toContainText(/isn.t assigned to you|can.t open this applicant/i);
      await expect(page.locator("main")).not.toContainText(/Mark as applied|Logins|Job preferences/);
    }
  });
});

test.describe("manager", () => {
  test.use({ storageState: authState("manager") });
  test("can open people/delivery admin but not admin-only sections", async ({ page }) => {
    for (const p of ["/admin/plans", "/admin/settings", "/admin/cms", "/admin/resume-styles"]) {
      expect((await page.goto(p))?.status(), p).toBe(403);
    }
    for (const p of ["/admin", "/admin/students", "/admin/assignments", "/admin/attendance"]) {
      expect((await page.goto(p))?.status(), p).toBe(200);
    }
  });
});

const SCAN: Record<"student" | "employee" | "admin", string[]> = {
  student: ["/app", "/app/applications", "/app/vault", "/app/profile", "/app/resumes", "/app/settings", "/app/billing", "/app/messages"],
  employee: ["/work", "/work/students", "/work/applications", "/work/messages", "/work/profile"],
  admin: ["/admin", "/admin/students", "/admin/employees", "/admin/payments", "/admin/audit-log", "/admin/settings"],
};
for (const role of Object.keys(SCAN) as (keyof typeof SCAN)[]) {
  test.describe(`secret scan as ${role}`, () => {
    test.use({ storageState: authState(role) });
    test(`no page or payload contains secret fields (SPEC §19)`, async ({ page }) => {
      test.setTimeout(300_000);
      const bodies: Promise<string>[] = [];
      page.on("response", (res) => {
        const ct = res.headers()["content-type"] ?? "";
        if (/json|text\/x-component|text\/html/.test(ct)) {
          // Bodies of responses from pages we navigated away from may never resolve; cap the wait.
          bodies.push(Promise.race([res.text().catch(() => ""), new Promise<string>((r) => setTimeout(() => r(""), 5000))]));
        }
      });
      for (const p of SCAN[role]) {
        await page.goto(p);
        await expectNoSecrets(await page.content(), `${role} ${p}`);
      }
      for (const b of await Promise.all(bodies)) await expectNoSecrets(b, `${role} network payload`);
    });
  });
}
