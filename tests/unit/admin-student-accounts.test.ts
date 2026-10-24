import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn(async () => undefined);
vi.mock("@/server/services/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...(a as [])) }));

import { db } from "@/server/db";
import {
  createStudent,
  markEmailVerified,
  reactivateStudent,
  resendStudentInvite,
  resendVerification,
  sendStudentPasswordReset,
  signOutEverywhere,
  suspendStudent,
  updateStudentAccount,
  updateStudentLinks,
  updateStudentPreferences,
} from "@/server/services/admin-student-accounts";
import { acceptInvite } from "@/server/services/accounts";
import { getStudentProfile, saveLinks, savePreferences } from "@/server/services/student-profile";
import { makeMarket, makeStudent, resetDb, uid } from "../setup/db";

const admin = { id: "admin-actor", role: "ADMIN" as const };
const manager = { id: "manager-actor", role: "MANAGER" as const };
const employee = { id: "emp-actor", role: "EMPLOYEE" as const };

type Email = { to: string; subject: string; content: { paragraphs: string[]; cta: { href: string } } };
const lastEmail = () => (sendEmail.mock.calls.at(-1) as unknown as [Email] | undefined)?.[0];

function input(over: Record<string, unknown> = {}) {
  return { name: "Priya Sharma", email: `${uid("p")}@upaya.test`, phone: "415 555 0123", marketCode: "US", mode: "invite" as const, sendEmail: true, ...over };
}

const PREFS = {
  targetTitles: ["Data Analyst", "data analyst", "BI Analyst"],
  seniority: "Mid" as const,
  industries: ["Fintech"],
  locations: ["Austin, TX"],
  remoteOk: true,
  workModes: ["REMOTE" as const, "HYBRID" as const],
  employmentTypes: ["FULL_TIME" as const],
  minSalary: "95000",
  salaryCurrency: "usd",
  workAuthorization: "STEM OPT",
  willingToRelocate: false,
  noticePeriod: "2 weeks",
  avoidCompanies: ["Meridian Retail"],
  targetCompanies: [],
};

const PROFILE_SELECT = { targetTitles: true, seniority: true, industries: true, locations: true, remoteOk: true, workModes: true, employmentTypes: true, minSalaryMinor: true, salaryCurrency: true, workAuthorization: true, needsSponsorship: true, willingToRelocate: true, noticePeriod: true, avoidCompanies: true, targetCompanies: true, linkedinUrl: true, githubUrl: true, portfolioUrl: true } as const;

beforeEach(async () => {
  await resetDb();
  sendEmail.mockClear();
});

describe("createStudent", () => {
  it("invite mode: INVITED user, no password, consents pending, invite token + student-worded email, audit", async () => {
    const m = await makeMarket();
    const r = await createStudent(admin, input());
    const u = await db.user.findUniqueOrThrow({ where: { id: r.userId }, select: { status: true, role: true, passwordHash: true, emailVerified: true, phone: true, timezone: true, student: { select: { id: true, marketId: true, consentTermsAt: true, consentVersion: true } } } });
    expect(u.status).toBe("INVITED");
    expect(u.role).toBe("STUDENT");
    expect(u.passwordHash).toBeNull();
    expect(u.emailVerified).toBeNull();
    expect(u.phone).toBe("+14155550123");
    expect(u.timezone).toBe(m.defaultTimezone);
    expect(u.student!.marketId).toBe(m.id);
    expect(u.student!.consentTermsAt).toBeNull();
    expect(u.student!.consentVersion).toBeNull();
    expect(await db.authToken.count({ where: { userId: r.userId, type: "INVITE", consumedAt: null } })).toBe(1);
    const mail = lastEmail()!;
    expect(mail.content.cta.href).toMatch(/\/invite\?token=/);
    expect(mail.content.paragraphs.join(" ")).toMatch(/specialist team at UpayaInd set up your account/);
    expect(mail.content.paragraphs.join(" ")).not.toMatch(/two-factor|staff/i);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "student.create", entityId: r.studentId } });
    expect(log.after).toMatchObject({ mode: "invite", createdBy: admin.id, marketCode: "US" });
  });

  it("the invite lands the student in onboarding (no 2FA): acceptInvite returns the role and activates the account", async () => {
    await makeMarket();
    const r = await createStudent(admin, input());
    const token = decodeURIComponent(lastEmail()!.content.cta.href.split("token=")[1]!);
    const accepted = await acceptInvite(token, "correct horse battery staple");
    expect(accepted.role).toBe("STUDENT");
    const u = await db.user.findUniqueOrThrow({ where: { id: r.userId }, select: { status: true, emailVerified: true, passwordHash: true } });
    expect(u.status).toBe("ACTIVE");
    expect(u.emailVerified).not.toBeNull();
    expect(u.passwordHash).not.toBeNull();
  });

  it("password mode: ACTIVE + verified, policy enforced, login email never contains the password", async () => {
    await makeMarket();
    await expect(createStudent(admin, input({ mode: "password", password: "short" }))).rejects.toThrow(/10 characters/);
    await expect(createStudent(admin, input({ mode: "password", password: "password12345" }))).rejects.toThrow();
    const r = await createStudent(admin, input({ mode: "password", password: "correct horse battery staple", sendEmail: true }));
    const u = await db.user.findUniqueOrThrow({ where: { id: r.userId }, select: { status: true, passwordHash: true, emailVerified: true } });
    expect(u.status).toBe("ACTIVE");
    expect(u.passwordHash).not.toBeNull();
    expect(u.emailVerified).not.toBeNull();
    expect(await db.authToken.count({ where: { userId: r.userId } })).toBe(0);
    const mail = lastEmail()!;
    expect(mail.content.cta.href).toMatch(/\/login$/);
    expect(JSON.stringify(mail)).not.toContain("correct horse battery staple");

    sendEmail.mockClear();
    await createStudent(admin, input({ mode: "password", password: "correct horse battery staple", sendEmail: false }));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses duplicate emails case-insensitively, including soft-deleted accounts", async () => {
    const m = await makeMarket();
    const i = input();
    await createStudent(admin, i);
    await expect(createStudent(admin, { ...i, email: i.email.toUpperCase() })).rejects.toThrow(/already exists/);
    const gone = await makeStudent(m.id);
    await db.user.update({ where: { id: gone.user.id }, data: { deletedAt: new Date(), status: "DEACTIVATED" } });
    await expect(createStudent(admin, input({ email: gone.user.email }))).rejects.toThrow(/deleted.*Restore/);
  });

  it("validates the market, the phone and the role", async () => {
    await makeMarket();
    await expect(createStudent(admin, input({ marketCode: "ZZ" }))).rejects.toThrow(/active market/);
    await expect(createStudent(admin, input({ phone: "123" }))).rejects.toThrow(/valid phone/);
    await expect(createStudent(employee, input())).rejects.toThrow();
    const r = await createStudent(manager, input({ phone: "" }));
    expect((await db.user.findUniqueOrThrow({ where: { id: r.userId } })).phone).toBeNull();
  });
});

describe("updateStudentAccount", () => {
  it("email change clears verification, bumps the session version and sends a new confirmation", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    await db.user.update({ where: { id: s.user.id }, data: { emailVerified: new Date(), sessionVersion: 3 } });
    const email = `${uid("new")}@upaya.test`;
    await updateStudentAccount(admin, s.student.id, { name: "Priya S", email, phone: "+14155550123", timezone: "America/Chicago", marketCode: "US" });
    const u = await db.user.findUniqueOrThrow({ where: { id: s.user.id }, select: { email: true, emailVerified: true, sessionVersion: true, name: true, timezone: true } });
    expect(u).toMatchObject({ email, emailVerified: null, sessionVersion: 4, name: "Priya S", timezone: "America/Chicago" });
    expect(await db.authToken.count({ where: { userId: s.user.id, type: "VERIFY_EMAIL", consumedAt: null } })).toBe(1);
    expect(lastEmail()!.content.cta.href).toMatch(/\/verify-email\?token=/);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "student.account_update", entityId: s.student.id } });
    expect(log.before).toMatchObject({ email: s.user.email });
    expect(log.after).toMatchObject({ email, sessionsRevoked: true });
  });

  it("keeps verification and sessions when the email is unchanged; refuses an email that belongs to someone else", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    const other = await makeStudent(m.id);
    await db.user.update({ where: { id: s.user.id }, data: { emailVerified: new Date() } });
    await updateStudentAccount(manager, s.student.id, { name: "Same", email: s.user.email, phone: "", timezone: "UTC", marketCode: "US" });
    const u = await db.user.findUniqueOrThrow({ where: { id: s.user.id }, select: { emailVerified: true, sessionVersion: true } });
    expect(u.emailVerified).not.toBeNull();
    expect(u.sessionVersion).toBe(0);
    await expect(updateStudentAccount(manager, s.student.id, { name: "Same", email: other.user.email, phone: "", timezone: "UTC", marketCode: "US" })).rejects.toThrow(/already exists/);
  });

  it("market change is refused while a live subscription exists, allowed otherwise", async () => {
    const us = await makeMarket("US");
    const ca = await makeMarket("CA");
    const s = await makeStudent(us.id);
    const plan = await db.plan.create({ data: { code: uid("plan"), name: "Standard" } });
    const price = await db.planPrice.create({ data: { planId: plan.id, marketId: us.id, interval: "MONTHLY", amountMinor: 9900, currency: "USD", dailyTarget: 25 } });
    const sub = await db.subscription.create({ data: { studentId: s.student.id, planPriceId: price.id, status: "PAST_DUE", provider: "STRIPE" } });
    const base = { name: s.user.name, email: s.user.email, phone: "", timezone: "UTC", marketCode: "CA" };
    await expect(updateStudentAccount(admin, s.student.id, base)).rejects.toThrow(/live subscription/);
    await db.subscription.update({ where: { id: sub.id }, data: { status: "EXPIRED" } });
    await updateStudentAccount(admin, s.student.id, base);
    expect((await db.studentProfile.findUniqueOrThrow({ where: { id: s.student.id } })).marketId).toBe(ca.id);
  });

  it("can suspend (with reason) and reactivate through the status field", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    const base = { name: s.user.name, email: s.user.email, phone: "", timezone: "UTC", marketCode: "US" };
    await updateStudentAccount(admin, s.student.id, { ...base, status: "SUSPENDED", reason: "Chargeback dispute" });
    expect((await db.user.findUniqueOrThrow({ where: { id: s.user.id } })).status).toBe("SUSPENDED");
    expect(await db.auditLog.count({ where: { action: "student.suspend", entityId: s.student.id } })).toBe(1);
    await updateStudentAccount(admin, s.student.id, { ...base, status: "ACTIVE" });
    expect((await db.user.findUniqueOrThrow({ where: { id: s.user.id } })).status).toBe("INVITED"); // no password yet
  });
});

describe("preferences + links via admin", () => {
  it("persist exactly the same shape as the student's own save, with an audit row", async () => {
    const m = await makeMarket();
    const a = await makeStudent(m.id);
    const b = await makeStudent(m.id);
    await savePreferences({ id: a.user.id, role: "STUDENT" }, PREFS);
    await saveLinks({ id: a.user.id, role: "STUDENT" }, { linkedinUrl: "linkedin.com/in/priya", githubUrl: "", portfolioUrl: "priya.dev" });
    await updateStudentPreferences(manager, b.student.id, PREFS);
    await updateStudentLinks(manager, b.student.id, { linkedinUrl: "linkedin.com/in/priya", githubUrl: "", portfolioUrl: "priya.dev" });
    const [pa, pb] = await Promise.all([db.studentProfile.findUniqueOrThrow({ where: { id: a.student.id }, select: PROFILE_SELECT }), db.studentProfile.findUniqueOrThrow({ where: { id: b.student.id }, select: PROFILE_SELECT })]);
    expect(pb).toEqual(pa);
    expect(pb).toMatchObject({ targetTitles: ["Data Analyst", "BI Analyst"], minSalaryMinor: 9_500_000, salaryCurrency: "USD", needsSponsorship: true, linkedinUrl: "https://linkedin.com/in/priya", githubUrl: null, portfolioUrl: "https://priya.dev" });
    // What the student then sees on /app/profile matches too.
    const seen = await getStudentProfile({ id: b.user.id, role: "STUDENT" });
    expect(seen.preferences.minSalary).toBe(95000);
    expect(await db.auditLog.count({ where: { action: "student.preferences_update", entityId: b.student.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "student.links_update", entityId: b.student.id } })).toBe(1);
    await expect(updateStudentPreferences(manager, b.student.id, { ...PREFS, workModes: [] })).rejects.toThrow(/work mode/);
    await expect(updateStudentLinks(manager, b.student.id, { linkedinUrl: "https://evil.example.com/in/x" })).rejects.toThrow(/LinkedIn/);
    await expect(updateStudentPreferences(employee, b.student.id, PREFS)).rejects.toThrow();
  });
});

describe("account actions", () => {
  it("suspend blocks login (status), revokes sessions + tokens and keeps the assignment; reactivate restores", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    await db.user.update({ where: { id: s.user.id }, data: { passwordHash: "x", status: "ACTIVE" } });
    const emp = await db.user.create({ data: { email: `${uid("e")}@t.test`, name: "Emp", role: "EMPLOYEE", employee: { create: { employeeCode: uid("UPY-"), marketIds: [m.id], workSchedule: {} } } }, include: { employee: true } });
    await db.assignment.create({ data: { studentId: s.student.id, employeeId: emp.employee!.id, source: "AUTO" } });
    await sendStudentPasswordReset(admin, s.student.id);
    expect(await db.authToken.count({ where: { userId: s.user.id, consumedAt: null } })).toBe(1);

    await expect(suspendStudent(admin, s.student.id, "no")).rejects.toThrow(/reason/);
    await suspendStudent(admin, s.student.id, "Chargeback dispute");
    const u = await db.user.findUniqueOrThrow({ where: { id: s.user.id }, select: { status: true, sessionVersion: true } });
    expect(u.status).toBe("SUSPENDED");
    expect(u.sessionVersion).toBe(1);
    expect(await db.authToken.count({ where: { userId: s.user.id, consumedAt: null } })).toBe(0);
    expect(await db.assignment.count({ where: { studentId: s.student.id, isActive: true } })).toBe(1);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "student.suspend", entityId: s.student.id } });
    expect(log.after).toMatchObject({ status: "SUSPENDED", reason: "Chargeback dispute" });
    await expect(suspendStudent(admin, s.student.id, "again")).rejects.toThrow(/already suspended/);

    const r = await reactivateStudent(manager, s.student.id);
    expect(r.status).toBe("ACTIVE");
    expect((await db.user.findUniqueOrThrow({ where: { id: s.user.id } })).status).toBe("ACTIVE");
    expect(await db.auditLog.count({ where: { action: "student.reactivate", entityId: s.student.id } })).toBe(1);
    await expect(reactivateStudent(manager, s.student.id)).rejects.toThrow(/isn't suspended/);
  });

  it("password reset issues a RESET token + email; invite only while INVITED; verification helpers; sign out everywhere", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    await sendStudentPasswordReset(manager, s.student.id);
    expect(await db.authToken.count({ where: { userId: s.user.id, type: "RESET_PASSWORD", consumedAt: null } })).toBe(1);
    expect(lastEmail()!.content.cta.href).toMatch(/\/reset-password\?token=/);
    expect(await db.auditLog.count({ where: { action: "student.password_reset_sent", entityId: s.student.id } })).toBe(1);

    await expect(resendStudentInvite(manager, s.student.id)).rejects.toThrow(/already activated/);
    await db.user.update({ where: { id: s.user.id }, data: { status: "INVITED" } });
    await resendStudentInvite(manager, s.student.id);
    expect(await db.authToken.count({ where: { userId: s.user.id, type: "INVITE", consumedAt: null } })).toBe(1);
    expect(lastEmail()!.content.cta.href).toMatch(/\/invite\?token=/);

    await resendVerification(manager, s.student.id);
    expect(await db.authToken.count({ where: { userId: s.user.id, type: "VERIFY_EMAIL", consumedAt: null } })).toBe(1);
    await markEmailVerified(manager, s.student.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: s.user.id } })).emailVerified).not.toBeNull();
    await expect(markEmailVerified(manager, s.student.id)).rejects.toThrow(/already verified/);
    await expect(resendVerification(manager, s.student.id)).rejects.toThrow(/already verified/);

    const { sessionVersion } = await signOutEverywhere(admin, s.student.id);
    expect(sessionVersion).toBe(1);
    expect(await db.auditLog.count({ where: { action: "user.sessions_revoked", entityId: s.user.id } })).toBe(1);
    await expect(signOutEverywhere(employee, s.student.id)).rejects.toThrow();
  });

  it("refuses to act on a deleted account", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    await db.user.update({ where: { id: s.user.id }, data: { deletedAt: new Date(), status: "DEACTIVATED" } });
    await expect(sendStudentPasswordReset(admin, s.student.id)).rejects.toThrow(/deleted/);
    await expect(updateStudentLinks(admin, s.student.id, {})).rejects.toThrow(/deleted/);
  });
});
