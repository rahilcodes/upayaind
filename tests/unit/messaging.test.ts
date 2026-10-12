import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { broadcast, getThread, getThreadForAdmin, listStaffThreads, listStudentThreads, runUnreadEmails, sendMessage, unreadCount } from "@/server/services/messaging";
import { autoAssign, reassign, setCover } from "@/server/services/assignment";
import { renderMarkdownLite } from "@/components/messaging/markdown-lite";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";

const sendEmail = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/server/services/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

beforeEach(async () => {
  await resetDb();
  sendEmail.mockClear();
});

async function setup() {
  const m = await makeMarket();
  const e = await makeEmployee(m.id, { name: "Arjun Rao" });
  const s = await makeStudent(m.id, "Priya Sharma");
  const r = await autoAssign(s.student.id, { notifyPeople: false });
  expect(r.status).toBe("ASSIGNED");
  const thread = await db.messageThread.findFirstOrThrow({ where: { studentId: s.student.id, isActive: true } });
  const mgr = await db.user.create({ data: { email: `mgr${Date.now()}@t.test`, name: "Meena Kapoor", role: "MANAGER" } });
  return {
    m,
    e,
    s,
    thread,
    emp: { id: e.user.id, role: "EMPLOYEE" as const },
    stu: { id: s.user.id, role: "STUDENT" as const },
    mgr: { id: mgr.id, role: "MANAGER" as const },
  };
}

describe("access", () => {
  it("only participants read/write; managers read-only; outsiders refused", async () => {
    const c = await setup();
    const outsider = await makeEmployee(c.m.id, { name: "Divya Menon", maxStudents: 0 });
    const otherStudent = await makeStudent(c.m.id, "Other");
    await sendMessage(c.emp, { threadId: c.thread.id, body: "Hi **Priya**" });
    await sendMessage(c.stu, { threadId: c.thread.id, body: "Hello!" });
    await expect(sendMessage({ id: outsider.user.id, role: "EMPLOYEE" }, { threadId: c.thread.id, body: "x" })).rejects.toThrow(/isn't available/);
    await expect(getThread({ id: otherStudent.user.id, role: "STUDENT" }, c.thread.id)).rejects.toThrow(/not found/);
    await expect(sendMessage(c.mgr, { threadId: c.thread.id, body: "x" })).rejects.toThrow(/not reply/);
    const v = await getThreadForAdmin(c.mgr, c.thread.id);
    expect(v.canWrite).toBe(false);
    expect(v.messages).toHaveLength(2);
    // Admin viewing doesn't mark anything read.
    expect(await db.message.count({ where: { threadId: c.thread.id, readAt: null } })).toBe(2);
    await expect(getThreadForAdmin(c.emp, c.thread.id)).rejects.toThrow(/Only managers/);
  });

  it("student sees the specialist's first name only", async () => {
    const c = await setup();
    await sendMessage(c.emp, { threadId: c.thread.id, body: "Hi" });
    const v = await getThread(c.stu, c.thread.id);
    expect(v.counterpart).toBe("Arjun");
    expect(v.messages[0]!.senderName).toBe("Arjun");
    expect((await listStudentThreads(c.stu))[0]!.title).toBe("Arjun");
  });

  it("reassigned old employee loses access; student keeps the old thread read-only", async () => {
    const c = await setup();
    const next = await makeEmployee(c.m.id, { name: "Rahul Verma" });
    await sendMessage(c.stu, { threadId: c.thread.id, body: "Before" });
    await reassign({ studentId: c.s.student.id, employeeId: next.employee.id, reason: "Load balancing", actorId: c.mgr.id });
    await expect(getThread(c.emp, c.thread.id)).rejects.toThrow(/isn't available/);
    await expect(sendMessage(c.emp, { threadId: c.thread.id, body: "x" })).rejects.toThrow();
    const old = await getThread(c.stu, c.thread.id);
    expect(old.canWrite).toBe(false);
    await expect(sendMessage(c.stu, { threadId: c.thread.id, body: "x" })).rejects.toThrow(/closed/);
    const threads = await listStudentThreads(c.stu);
    expect(threads.map((t) => [t.title, t.isActive])).toEqual([["Rahul", true], ["Arjun", false]]);
    expect(await listStaffThreads(c.emp)).toHaveLength(0);
  });

  it("a cover employee can message during the cover window", async () => {
    const c = await setup();
    const cover = await makeEmployee(c.m.id, { name: "Divya Menon" });
    const now = Date.now();
    await setCover({ primaryEmployeeId: c.e.employee.id, coverEmployeeId: cover.employee.id, from: new Date(now - 3600e3), to: new Date(now + 86400e3), actorId: c.mgr.id });
    const coverActor = { id: cover.user.id, role: "EMPLOYEE" as const };
    expect((await listStaffThreads(coverActor)).map((t) => t.id)).toEqual([c.thread.id]);
    await expect(sendMessage(coverActor, { threadId: c.thread.id, body: "Covering for Arjun today" })).resolves.toBeTruthy();
  });
});

describe("read receipts + unread counts", () => {
  it("opening a thread marks only the other side's messages read", async () => {
    const c = await setup();
    await sendMessage(c.emp, { threadId: c.thread.id, body: "One" });
    await sendMessage(c.emp, { threadId: c.thread.id, body: "Two" });
    await sendMessage(c.stu, { threadId: c.thread.id, body: "Three" });
    expect(await unreadCount(c.stu)).toBe(2);
    expect(await unreadCount(c.emp)).toBe(1);
    await getThread(c.stu, c.thread.id);
    expect(await unreadCount(c.stu)).toBe(0);
    expect(await unreadCount(c.emp)).toBe(1);
    const v = await getThread(c.emp, c.thread.id);
    expect(v.messages.filter((m) => m.mine).every((m) => m.readAt)).toBe(true);
    expect(await unreadCount(c.emp)).toBe(0);
  });

  it("validates attachments and linked applications", async () => {
    const c = await setup();
    await expect(sendMessage(c.stu, { threadId: c.thread.id, body: "" })).rejects.toThrow(/Write a message/);
    await expect(sendMessage(c.stu, { threadId: c.thread.id, body: "see", applicationId: "nope" })).rejects.toThrow(/doesn't belong/);
    await expect(sendMessage(c.stu, { threadId: c.thread.id, body: "file" }, [{ buffer: Buffer.from("MZ not allowed"), filename: "x.exe" }])).rejects.toThrow(/Unsupported file type/);
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
    const m = await sendMessage(c.stu, { threadId: c.thread.id, body: "" }, [{ buffer: png, filename: "screenshot.png" }]);
    const v = await getThread(c.emp, c.thread.id);
    expect(v.messages.find((x) => x.id === m.id)!.attachments[0]).toMatchObject({ filename: "screenshot.png", mime: "image/png" });
    const f = await db.fileObject.findFirstOrThrow({ where: { purpose: "message" } });
    expect(f.studentId).toBe(c.s.student.id);
  });
});

describe("unread email job", () => {
  it("emails once after 10 minutes, never for read messages", async () => {
    const c = await setup();
    const t0 = new Date();
    await sendMessage(c.stu, { threadId: c.thread.id, body: "Are you there?" }, [], t0);
    await sendMessage(c.emp, { threadId: c.thread.id, body: "Read quickly" }, [], t0);
    await getThread(c.stu, c.thread.id, {}); // student reads the employee's message
    expect((await runUnreadEmails(new Date(t0.getTime() + 5 * 60_000))).sent).toBe(0);
    expect((await runUnreadEmails(new Date(t0.getTime() + 11 * 60_000))).sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((sendEmail.mock.calls[0]![0] as { to: string }).to).toBe(c.e.user.email);
    expect((await runUnreadEmails(new Date(t0.getTime() + 20 * 60_000))).sent).toBe(0);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("broadcast", () => {
  it("creates one individual message per assigned student", async () => {
    const c = await setup();
    const s2 = await makeStudent(c.m.id, "Lucas Moreno");
    await autoAssign(s2.student.id, { notifyPeople: false });
    const r = await broadcast(c.emp, "Office closed Friday for Diwali.");
    expect(r.count).toBe(2);
    const rows = await db.message.findMany({ where: { isBroadcast: true } });
    expect(new Set(rows.map((x) => x.threadId)).size).toBe(2);
    await expect(broadcast(c.stu, "x")).rejects.toThrow();
  });
});

describe("markdown-lite", () => {
  it("renders bold/italic/links/line breaks and escapes HTML", () => {
    const html = renderMarkdownLite("**Hi** _there_\n<script>alert(1)</script> [site](https://ex.com) https://a.test/x javascript:alert(1) [bad](javascript:alert(1))");
    expect(html).toContain("<strong>Hi</strong>");
    expect(html).toContain("<em>there</em>");
    expect(html).toContain("<br>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('<a href="https://ex.com/"');
    expect(html).toContain('href="https://a.test/x"');
    expect(html).not.toMatch(/href="javascript/);
  });
});
