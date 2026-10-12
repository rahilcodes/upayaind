import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the session: requireRole/requireAction read it through @/server/auth.
const session = { user: { id: "u1", role: "MANAGER", name: "M", email: "m@t.test", timezone: "UTC", onboarded: true, mfa: "ok" } };
vi.mock("@/server/auth", () => ({ auth: async () => session }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

import { db } from "@/server/db";
import { saveGeneralAction, saveTemplateAction } from "@/app/admin/(shell)/settings/actions";
import { deleteStyleAction, saveStyleAction, toggleTemplateAction } from "@/app/admin/(shell)/resume-styles/actions";
import { createSlotsAction, deletePrepAction, savePrepAction } from "@/app/admin/(shell)/prep/actions";
import { saveRulesAction } from "@/app/admin/(shell)/assignments/actions";
import { confirmDeletionAction } from "@/app/admin/(shell)/students/actions";
import { resetDb } from "../setup/db";

beforeEach(async () => {
  await resetDb();
  session.user.role = "MANAGER";
});

const general = { autoAssignEnabled: false, defaultMaxStudents: 9, noResponseDays: 30, belowTargetAlertTime: "15:00", aiLimits: { employeePerHour: 60, studentPerDay: 300 } };

describe("admin-only server actions reject managers", () => {
  it("settings, resume styles, prep, assignment rules and deletion are blocked for MANAGER", async () => {
    const results = await Promise.all([
      saveGeneralAction(general),
      saveTemplateAction("payment_failed", { subject: "x" }),
      saveStyleAction({ code: "X1", name: "X", documentTitle: "CV", pageSize: "A4", maxPages: 2, dateFormat: "MMM yyyy", spelling: "en-GB", includePhoto: false, includeDob: false, includeNationality: false, includeFullAddress: false, summaryLabel: "Profile", sectionOrder: ["summary", "experience", "education"], rulesPrompt: "" }),
      deleteStyleAction("nope"),
      toggleTemplateAction("nope", false),
      savePrepAction({ title: "STAR method", type: "ARTICLE", tags: [], marketCodes: [], isPublished: true }),
      deletePrepAction("nope"),
      createSlotsAction({ conductedById: "x", scheduledAt: new Date(Date.now() + 86400e3), durationMin: 45, focus: "SQL" }),
      saveRulesAction(false, 9),
      confirmDeletionAction("nope", "requested by email"),
    ]);
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/access/i);
    }
    expect(await db.setting.count()).toBe(0);
    expect(await db.prepResource.count()).toBe(0);
    expect(await db.resumeStyle.count()).toBe(0);
  });

  it("the same settings action succeeds for ADMIN", async () => {
    session.user.role = "ADMIN";
    const r = await saveGeneralAction(general);
    expect(r.ok).toBe(true);
    expect((await db.setting.findUnique({ where: { key: "defaultMaxStudents" } }))?.value).toBe(9);
  });

  it("employees and students are blocked from manager actions", async () => {
    session.user.role = "EMPLOYEE";
    const r = await saveRulesAction(true, 8);
    expect(r.ok).toBe(false);
  });
});
