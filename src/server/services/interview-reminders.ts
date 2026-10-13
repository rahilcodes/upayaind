import "server-only";
import { db } from "@/server/db";
import { formatInTz } from "@/lib/format";
import { notify } from "./notify";

/**
 * Interview reminders (F6/F13, D-103): 24 h and 1 h before `Interview.scheduledAt`
 * to the student and the specialist. Runs hourly, so the windows are wide enough
 * that no interview is skipped:
 *   - 1 h reminder:  0 < until ≤ 90 min   (claimed via reminder1hSentAt)
 *   - 24 h reminder: 90 min < until ≤ 24 h (claimed via reminder24SentAt)
 * Each marker is claimed with a conditional update, so concurrent runs can't
 * double-send. Interviews with an outcome or on closed applications are skipped.
 */

const HOUR = 3600e3;
const CLOSED = ["REJECTED", "WITHDRAWN", "HIRED"] as const;

export async function runInterviewReminders(now = new Date()) {
  let sent = 0;
  const rows = await db.interview.findMany({
    where: {
      outcome: null,
      scheduledAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) },
      OR: [{ reminder24SentAt: null }, { reminder1hSentAt: null }],
      application: { status: { notIn: [...CLOSED] } },
    },
    select: {
      id: true,
      scheduledAt: true,
      timezone: true,
      round: true,
      mode: true,
      meetingLink: true,
      reminder24SentAt: true,
      reminder1hSentAt: true,
      application: {
        select: {
          id: true,
          companyName: true,
          jobTitle: true,
          studentId: true,
          student: { select: { userId: true, user: { select: { name: true, timezone: true } } } },
          employee: { select: { userId: true } },
        },
      },
    },
    take: 500,
  });

  for (const i of rows) {
    const until = i.scheduledAt.getTime() - now.getTime();
    const kind: "1h" | "24h" | null = until <= 1.5 * HOUR ? (i.reminder1hSentAt ? null : "1h") : i.reminder24SentAt ? null : "24h";
    if (!kind) continue;
    // Claim atomically (idempotent under concurrent runs / retries).
    const claim = await db.interview.updateMany({
      where: kind === "1h" ? { id: i.id, reminder1hSentAt: null } : { id: i.id, reminder24SentAt: null },
      data: kind === "1h" ? { reminder1hSentAt: now } : { reminder24SentAt: now },
    });
    if (claim.count === 0) continue;

    const app = i.application;
    const employeeUserId = (await db.assignment.findFirst({ where: { studentId: app.studentId, isActive: true, type: "PRIMARY" }, orderBy: { startsAt: "desc" }, select: { employee: { select: { userId: true } } } }))?.employee.userId ?? app.employee.userId;
    const employee = await db.user.findUnique({ where: { id: employeeUserId }, select: { timezone: true } });
    const base = { applicationId: app.id, company: app.companyName, title: app.jobTitle, round: i.round, mode: i.mode, meetingLink: i.meetingLink, inLabel: kind === "1h" ? "in 1 hour" : "tomorrow" };
    const studentWhen = `${formatInTz(i.scheduledAt, app.student.user.timezone, "EEE d MMM, h:mm a")} (your time)`;
    const employeeWhen = `${formatInTz(i.scheduledAt, employee?.timezone ?? i.timezone, "EEE d MMM, h:mm a")} (your time)`;
    await Promise.all([
      notify(app.student.userId, "interview_reminder", { ...base, when: studentWhen, link: `/app/applications/${app.id}` }).catch((e) => console.error("[interview-reminder] student notify failed", e)),
      notify(employeeUserId, "interview_reminder", { ...base, when: employeeWhen, who: app.student.user.name, link: `/work/interviews?application=${app.id}` }).catch((e) => console.error("[interview-reminder] employee notify failed", e)),
    ]);
    sent++;
  }
  return { sent, checked: rows.length };
}
