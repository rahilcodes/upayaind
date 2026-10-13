import { beforeEach, describe, expect, it, vi } from "vitest";

// Session + request plumbing used by guards/view-as. Mutable so tests can switch roles.
const session: { user: Record<string, unknown> | null } = { user: null };
const jar = new Map<string, string>();
const hdrs = new Map<string, string>();
vi.mock("@/server/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null), signMfaProof: () => "x", unstable_update: vi.fn(), signOut: vi.fn(), signSessionVersionProof: () => "p" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined), set: (k: string, v: string) => jar.set(k, v), delete: (k: string) => jar.delete(k) }),
  headers: async () => ({ get: (k: string) => hdrs.get(k.toLowerCase()) ?? null }),
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
const sendEmail = vi.fn(async () => undefined);
vi.mock("@/server/services/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...(a as [])) }));

import { db } from "@/server/db";
import { signViewAs, verifyViewAs, VIEW_AS_COOKIE } from "@/server/auth/view-as.edge";
import { issueViewAsToken, getViewAs, assertNotViewAs } from "@/server/auth/view-as";
import { requireRole, requireStudent } from "@/server/auth/guards";
import { sessionVersionValid } from "@/server/auth/sessions";
import { adminResetTwoFactor, backupCodesRemaining, bumpSessionVersion, checkTotp, hashBackupCode, newBackupCodes, regenerateBackupCodes, consumeBackupCode } from "@/server/services/accounts";
import { extendedPeriodEnd, pausedDaysBetween, pauseSubscription, resumeSubscription } from "@/server/services/billing/pause";
import { buildAlertBody, sendAlert, sendTestAlert } from "@/server/services/alerts";
import { setSetting } from "@/server/services/settings";
import { searchAll } from "@/server/services/search";
import { hashPassword } from "@/server/auth/password";
import { newTotpSecret } from "@/server/auth/totp";
import { makeEmployee, makeMarket, makeStudent, resetDb, uid } from "../setup/db";

const SECRET = process.env.AUTH_SECRET!;

beforeEach(async () => {
  await resetDb();
  session.user = null;
  jar.clear();
  hdrs.clear();
  sendEmail.mockClear();
});

async function makeAdmin(role: "ADMIN" | "MANAGER" = "ADMIN") {
  return db.user.create({ data: { email: `${uid("a")}@t.test`, name: "Admin", role, timezone: "UTC", totpEnabled: true } });
}

function signInAs(u: { id: string; role: string; name: string; email: string }) {
  session.user = { id: u.id, role: u.role, name: u.name, email: u.email, timezone: "UTC", onboarded: true, mfa: "ok", needsProfile: false };
}

// ───────────────────────── 11. View as student ─────────────────────────

describe("view as student (D-120)", () => {
  it("rejects forged, tampered and expired cookies", async () => {
    const good = await signViewAs(SECRET, { adminId: "a", studentId: "s", studentUserId: "su", exp: Date.now() + 60_000 });
    expect(await verifyViewAs(SECRET, good)).toMatchObject({ adminId: "a", studentId: "s" });
    expect(await verifyViewAs("another-secret-another-secret-another", good)).toBeNull();
    const [body, mac] = good.split(".");
    expect(await verifyViewAs(SECRET, `${body}x.${mac}`)).toBeNull();
    expect(await verifyViewAs(SECRET, `${body}.${mac!.slice(0, -2)}zz`)).toBeNull();
    expect(await verifyViewAs(SECRET, "garbage")).toBeNull();
    expect(await verifyViewAs(SECRET, "")).toBeNull();
    const expired = await signViewAs(SECRET, { adminId: "a", studentId: "s", studentUserId: "su", exp: Date.now() - 1 });
    expect(await verifyViewAs(SECRET, expired)).toBeNull();
    const tooLate = await signViewAs(SECRET, { adminId: "a", studentId: "s", studentUserId: "su", exp: Date.now() + 1000 });
    expect(await verifyViewAs(SECRET, tooLate, Date.now() + 2000)).toBeNull();
  });

  it("only the issuing ADMIN with the cookie is treated as the student; managers never are", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id, "Viewed Student");
    const admin = await makeAdmin();
    const other = await makeAdmin();
    jar.set(VIEW_AS_COOKIE, await issueViewAsToken(admin.id, s.student.id, s.user.id));

    signInAs(other);
    expect(await getViewAs()).toBeNull();
    const manager = await makeAdmin("MANAGER");
    jar.set(VIEW_AS_COOKIE, await issueViewAsToken(manager.id, s.student.id, s.user.id));
    signInAs(manager);
    expect(await getViewAs()).toBeNull();

    jar.set(VIEW_AS_COOKIE, await issueViewAsToken(admin.id, s.student.id, s.user.id));
    signInAs(admin);
    const v = await getViewAs();
    expect(v).toMatchObject({ adminId: admin.id, studentId: s.student.id, studentName: "Viewed Student" });
    const asStudent = await requireRole(["STUDENT"]);
    expect(asStudent.id).toBe(s.user.id);
    expect(asStudent.role).toBe("STUDENT");
    expect(asStudent.viewAs?.adminId).toBe(admin.id);
    // The admin's own context is untouched.
    const asAdmin = await requireRole(["ADMIN"]);
    expect(asAdmin.id).toBe(admin.id);
  });

  it("refuses every mutation while viewing: server actions and the explicit guard", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    const admin = await makeAdmin();
    jar.set(VIEW_AS_COOKIE, await issueViewAsToken(admin.id, s.student.id, s.user.id));
    signInAs(admin);
    await expect(assertNotViewAs()).rejects.toThrow(/read-only/);
    // Page render (no Next-Action header) works…
    const page = await requireStudent();
    expect(page.student.id).toBe(s.student.id);
    // …a server action (Next-Action header) is refused.
    hdrs.set("next-action", "abc123");
    await expect(requireStudent()).rejects.toThrow(/read-only/);
    await expect(requireRole(["STUDENT"])).rejects.toThrow(/read-only/);
  });
});

// ───────────────────────── 12. Subscription pause ─────────────────────────

describe("subscription pause (D-121)", () => {
  it("period extension math: whole days, ceil, at least one", () => {
    const end = new Date("2026-11-01T00:00:00Z");
    expect(pausedDaysBetween(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-04T00:00:00Z"))).toBe(3);
    expect(pausedDaysBetween(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-04T00:00:01Z"))).toBe(4);
    expect(pausedDaysBetween(new Date("2026-10-01T10:00:00Z"), new Date("2026-10-01T11:00:00Z"))).toBe(1);
    expect(pausedDaysBetween(new Date("2026-10-02T00:00:00Z"), new Date("2026-10-01T00:00:00Z"))).toBe(1);
    expect(extendedPeriodEnd(end, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-11T00:00:00Z"))).toEqual({ end: new Date("2026-11-11T00:00:00Z"), days: 10 });
    expect(extendedPeriodEnd(null, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-11T00:00:00Z"))).toEqual({ end: null, days: 10 });
  });

  it("pause stops targets and resume extends the period by the paused days (accumulating)", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    const e = await makeEmployee(m.id);
    await db.assignment.create({ data: { studentId: s.student.id, employeeId: e.employee.id, type: "PRIMARY", source: "MANUAL", isActive: true, startsAt: new Date() } });
    const plan = await db.plan.create({ data: { code: uid("plan"), name: "Standard", features: [] } });
    const pp = await db.planPrice.create({ data: { planId: plan.id, marketId: m.id, interval: "MONTHLY", amountMinor: 29900, currency: "USD", dailyTarget: 35, isActive: true } });
    const end = new Date("2026-11-15T00:00:00Z");
    const sub = await db.subscription.create({ data: { studentId: s.student.id, planPriceId: pp.id, status: "ACTIVE", provider: "STRIPE", providerSubId: "sub_sim_x", currentPeriodStart: new Date("2026-10-15T00:00:00Z"), currentPeriodEnd: end, remindersSent: ["T7:x"] } });
    const admin = await makeAdmin();

    const t0 = new Date("2026-10-20T09:00:00Z");
    await pauseSubscription(admin.id, sub.id, "Holiday", t0);
    let row = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(row.status).toBe("PAUSED");
    expect(row.pausedAt).toEqual(t0);
    await expect(pauseSubscription(admin.id, sub.id, "again", t0)).rejects.toThrow(/active/i);
    // Student + employee were told.
    const types = (await db.notification.findMany({ select: { type: true, userId: true } })).map((n) => `${n.type}:${n.userId}`);
    expect(types).toContain(`subscription_paused:${s.user.id}`);
    expect(types).toContain(`subscription_paused_employee:${e.user.id}`);

    const r = await resumeSubscription(admin.id, sub.id, new Date("2026-10-25T08:00:00Z")); // 4 d 23 h → 5 days
    expect(r.days).toBe(5);
    row = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(row.status).toBe("ACTIVE");
    expect(row.pausedAt).toBeNull();
    expect(row.pausedDays).toBe(5);
    expect(row.currentPeriodEnd).toEqual(new Date("2026-11-20T00:00:00Z"));
    expect(row.remindersSent).toEqual([]);
    await expect(resumeSubscription(admin.id, sub.id)).rejects.toThrow(/isn't paused/);

    // Second pause accumulates.
    await pauseSubscription(admin.id, sub.id, "Again", new Date("2026-11-01T00:00:00Z"));
    await resumeSubscription(admin.id, sub.id, new Date("2026-11-03T00:00:00Z"));
    row = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(row.pausedDays).toBe(7);
    expect(row.currentPeriodEnd).toEqual(new Date("2026-11-22T00:00:00Z"));
    const actions = (await db.auditLog.findMany({ where: { entityId: sub.id }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(["subscription.pause", "subscription.resume", "subscription.pause", "subscription.resume"]);
  });
});

// ───────────────────────── 13. Command palette search ─────────────────────────

describe("palette search access rules (D-125)", () => {
  it("employees only see assigned students and their applications; managers/admins everything", async () => {
    const m = await makeMarket();
    const mine = await makeStudent(m.id, "Zara Mine");
    const theirs = await makeStudent(m.id, "Zara Theirs");
    const e1 = await makeEmployee(m.id, { name: "Ravi Specialist" });
    const e2 = await makeEmployee(m.id, { name: "Ravi Other" });
    await db.assignment.create({ data: { studentId: mine.student.id, employeeId: e1.employee.id, type: "PRIMARY", source: "MANUAL", isActive: true, startsAt: new Date() } });
    await db.assignment.create({ data: { studentId: theirs.student.id, employeeId: e2.employee.id, type: "PRIMARY", source: "MANUAL", isActive: true, startsAt: new Date() } });
    const app = (sid: string, eid: string, company: string) =>
      db.jobApplication.create({ data: { studentId: sid, employeeId: eid, companyName: company, jobTitle: "Engineer", jobUrl: "https://x.test/j", jobUrlNormalized: `x.test/j/${company}`, source: "LINKEDIN", status: "APPLIED", appliedAt: new Date() } });
    await app(mine.student.id, e1.employee.id, "Acme Robotics");
    await app(theirs.student.id, e2.employee.id, "Acme Shipping");

    const asE1 = await searchAll({ id: e1.user.id, role: "EMPLOYEE" }, "zara");
    expect(asE1.students.map((s) => s.title)).toEqual(["Zara Mine"]);
    expect(asE1.employees).toEqual([]);
    expect(asE1.students[0]!.href).toBe(`/work/students/${mine.student.id}`);
    const appsE1 = await searchAll({ id: e1.user.id, role: "EMPLOYEE" }, "acme");
    expect(appsE1.applications.map((a) => a.title)).toEqual(["Engineer · Acme Robotics"]);

    const admin = await makeAdmin();
    const asAdmin = await searchAll({ id: admin.id, role: "ADMIN" }, "zara");
    expect(asAdmin.students.map((s) => s.title).sort()).toEqual(["Zara Mine", "Zara Theirs"]);
    expect(asAdmin.students[0]!.href.startsWith("/admin/students/")).toBe(true);
    const emps = await searchAll({ id: admin.id, role: "MANAGER" }, "ravi");
    expect(emps.employees.map((x) => x.title).sort()).toEqual(["Ravi Other", "Ravi Specialist"]);
    expect((await searchAll({ id: admin.id, role: "ADMIN" }, "acme")).applications).toHaveLength(2);

    // Min length and student role.
    expect(await searchAll({ id: admin.id, role: "ADMIN" }, "z")).toEqual({ students: [], employees: [], applications: [] });
    await expect(searchAll({ id: mine.user.id, role: "STUDENT" }, "zara")).rejects.toThrow();
  });

  it("caps each group at 8 results", async () => {
    const m = await makeMarket();
    for (let i = 0; i < 10; i++) await makeStudent(m.id, `Common Name ${i}`);
    const admin = await makeAdmin();
    expect((await searchAll({ id: admin.id, role: "ADMIN" }, "common name")).students).toHaveLength(8);
  });
});

// ───────────────────────── 14. Webhook alerts ─────────────────────────

describe("webhook alerts (D-122)", () => {
  const hook = (id: string, events: string[], url = `https://hooks.test/${id}`) => ({ id, url, label: id, events, enabled: true });

  it("builds a Slack-style body with text + blocks and a Discord `content` alias", () => {
    const body = buildAlertBody("new_lead", { title: "Jane", lines: ["jane@x.test"], link: "/admin/leads", linkLabel: "Open leads" });
    expect(body.text).toContain("New lead: Jane");
    expect(body.text).toContain("jane@x.test");
    expect(body.text).toContain("/admin/leads");
    expect(body.content).toBe(body.text);
    expect(body.blocks).toHaveLength(3);
  });

  it("posts only to webhooks subscribed to the event, never throws, and logs failures", async () => {
    await setSetting("alertWebhooks", [hook("a", ["new_lead"]), hook("b", ["payment_failed"]), { ...hook("c", ["new_lead"]), enabled: false }, hook("d", ["new_lead"], "https://hooks.test/boom")]);
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url));
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body)).text).toContain("New lead");
      return new Response(String(url).endsWith("boom") ? "nope" : "ok", { status: String(url).endsWith("boom") ? 500 : 200 });
    }) as unknown as typeof fetch;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await sendAlert("new_lead", { title: "Jane" }, { fetch: fetchMock });
    expect(calls.sort()).toEqual(["https://hooks.test/a", "https://hooks.test/boom"]);
    expect(r).toEqual({ sent: 1, failed: 1 });
    expect(err).toHaveBeenCalled();
    err.mockRestore();

    // No webhook for this event → no fetch at all.
    const none = vi.fn() as unknown as typeof fetch;
    expect(await sendAlert("below_target", { title: "x" }, { fetch: none })).toEqual({ sent: 0, failed: 0 });
    expect(none).not.toHaveBeenCalled();
  });

  it("test alert reports a readable error", async () => {
    const bad = vi.fn(async () => new Response("x", { status: 403 })) as unknown as typeof fetch;
    await expect(sendTestAlert("https://hooks.test/t", "Admin", { fetch: bad })).rejects.toThrow(/HTTP 403/);
    await expect(sendTestAlert("http://insecure.test/t", "Admin", { fetch: bad })).rejects.toThrow();
    const ok = vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    expect(await sendTestAlert("https://hooks.test/t", "Admin", { fetch: ok })).toEqual({ ok: true });
  });
});

// ───────────────────────── 15. 2FA recovery + sessions ─────────────────────────

describe("2FA backup codes (D-123)", () => {
  async function staffWith2fa() {
    const { sealed } = newTotpSecret();
    return db.user.create({ data: { email: `${uid("s")}@t.test`, name: "Staff", role: "EMPLOYEE", passwordHash: await hashPassword("Correct-horse-battery-9"), totpSecretEnc: sealed, totpEnabled: true } });
  }

  it("codes are issued once, stored hashed and each works a single time", async () => {
    const u = await staffWith2fa();
    const codes = await regenerateBackupCodes(u.id, "Correct-horse-battery-9");
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id }, select: { totpBackupCodes: true } });
    expect(row.totpBackupCodes).not.toContain(codes[0]);
    expect(row.totpBackupCodes).toContain(hashBackupCode(codes[0]!));

    expect(await consumeBackupCode(u.id, codes[0]!.toUpperCase().replace("-", " "))).toBe(true); // case/separators ignored
    expect(await consumeBackupCode(u.id, codes[0]!)).toBe(false); // single use
    expect(await consumeBackupCode(u.id, "zzzz-zzzz")).toBe(false);
    expect(await consumeBackupCode(u.id, "short")).toBe(false);
    expect(await backupCodesRemaining(u.id)).toBe(7);

    // Concurrent use of one code: exactly one wins.
    const results = await Promise.all(Array.from({ length: 5 }, () => consumeBackupCode(u.id, codes[1]!)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await backupCodesRemaining(u.id)).toBe(6);

    await expect(regenerateBackupCodes(u.id, "wrong")).rejects.toThrow(/password/i);
    expect(newBackupCodes(3)).toHaveLength(3);
  });

  it("first successful TOTP enrolment returns codes; later checks don't", async () => {
    const { secret, sealed } = newTotpSecret();
    const u = await db.user.create({ data: { email: `${uid("s")}@t.test`, name: "S", role: "EMPLOYEE", totpSecretEnc: sealed, totpEnabled: false } });
    const { generateSync } = await import("otplib");
    const code = generateSync({ secret }) as unknown as string | { token: string };
    const token = typeof code === "string" ? code : code.token;
    const first = await checkTotp(u.id, token);
    expect(first.backupCodes).toHaveLength(8);
    const again = await checkTotp(u.id, token);
    expect(again.backupCodes).toBeNull();
  });

  it("admin reset clears the authenticator, codes and sessions, and emails the employee", async () => {
    const m = await makeMarket();
    const e = await makeEmployee(m.id);
    await db.user.update({ where: { id: e.user.id }, data: { totpEnabled: true, totpSecretEnc: "x", totpBackupCodes: ["h"] } });
    const admin = await makeAdmin();
    const manager = await makeAdmin("MANAGER");
    await expect(adminResetTwoFactor(manager, e.employee.id)).rejects.toThrow(/admin/);
    await adminResetTwoFactor(admin, e.employee.id);
    const row = await db.user.findUniqueOrThrow({ where: { id: e.user.id }, select: { totpEnabled: true, totpSecretEnc: true, totpBackupCodes: true, sessionVersion: true } });
    expect(row).toEqual({ totpEnabled: false, totpSecretEnc: null, totpBackupCodes: [], sessionVersion: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((await db.auditLog.findFirst({ where: { action: "user.2fa_reset" } }))?.entityId).toBe(e.user.id);
  });
});

describe("session version (D-124)", () => {
  it("pure helper: tokens without sv are version 0; any mismatch invalidates", () => {
    expect(sessionVersionValid(undefined, 0)).toBe(true);
    expect(sessionVersionValid(0, 0)).toBe(true);
    expect(sessionVersionValid(undefined, 1)).toBe(false);
    expect(sessionVersionValid(1, 1)).toBe(true);
    expect(sessionVersionValid(1, 2)).toBe(false);
    expect(sessionVersionValid(2, 1)).toBe(false);
    expect(sessionVersionValid("1", 1)).toBe(false);
  });

  it("bumping increments and audits", async () => {
    const u = await makeAdmin();
    expect(await bumpSessionVersion(u.id)).toBe(1);
    expect(await bumpSessionVersion(u.id)).toBe(2);
    expect(await db.auditLog.count({ where: { action: "user.sessions_revoked", entityId: u.id } })).toBe(2);
  });
});
