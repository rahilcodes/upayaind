import "server-only";
import { db } from "@/server/db";
import { absoluteUrl } from "@/lib/utils";
import { sendEmail, type EmailAttachment } from "./email";
import { getSetting } from "./settings";

/**
 * One notification service for every F13 event: writes an in-app Notification
 * (bell icon) and sends an email when the user's preferences allow.
 * WhatsApp (P1) plugs in through `channels` later.
 */

type P = Record<string, string | number | null | undefined>;

type Template = {
  /** Shown in the bell and as the email heading. */
  title: (p: P) => string;
  body: (p: P) => string;
  link?: (p: P) => string | undefined;
  subject?: (p: P) => string;
  paragraphs?: (p: P) => string[];
  cta?: (p: P) => string;
  /** Can't be switched off (billing, security). */
  mandatory?: boolean;
  /** In-app only (no email). */
  inAppOnly?: boolean;
  /** Email only (no bell entry). */
  emailOnly?: boolean;
};

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export const TEMPLATES = {
  payment_succeeded: {
    title: (p) => `Payment received: ${s(p.amount)}`,
    body: (p) => `Thanks! Your ${s(p.plan)} plan is active until ${s(p.periodEnd)}.`,
    link: () => "/app/billing",
    cta: () => "View billing",
    mandatory: true,
  },
  payment_failed: {
    title: () => "Your payment didn’t go through",
    body: () => "Please update your payment method to keep your applications going.",
    link: () => "/app/billing",
    cta: () => "Update payment method",
    mandatory: true,
  },
  payment_failed_admin: {
    title: (p) => `Payment failed: ${s(p.student)}`,
    body: (p) => `${s(p.amount)} for ${s(p.plan)}. Reason: ${s(p.reason) || "unknown"}.`,
    link: (p) => `/admin/students/${s(p.studentId)}`,
  },
  assigned_student: {
    title: (p) => `Your specialist is ${s(p.employeeFirstName)}`,
    body: (p) => `${s(p.employeeFirstName)} will start applying for you as soon as your onboarding is complete. You can message them any time.`,
    link: () => "/app/messages",
    cta: () => "Say hello",
  },
  assigned_employee: {
    title: (p) => `New student assigned: ${s(p.studentName)}`,
    body: (p) => `${s(p.studentName)} (${s(p.plan)}, ${s(p.target)}/day) is now yours.`,
    link: (p) => `/work/students/${s(p.studentId)}`,
    cta: () => "Open student",
  },
  reassigned_student: {
    title: (p) => `Your new specialist is ${s(p.employeeFirstName)}`,
    body: (p) => `${s(p.employeeFirstName)} is now handling your applications. Your history and previous messages stay available.`,
    link: () => "/app/messages",
  },
  unassigned_employee: {
    title: (p) => `${s(p.studentName)} was reassigned`,
    body: (p) => `${s(p.studentName)} has moved to another specialist. Reason: ${s(p.reason)}.`,
    link: () => "/work/students",
  },
  cover_employee: {
    title: (p) => `You’re covering ${s(p.studentName)}`,
    body: (p) => `From ${s(p.from)} to ${s(p.to)} while ${s(p.primaryName)} is on leave.`,
    link: (p) => `/work/students/${s(p.studentId)}`,
  },
  awaiting_assignment: {
    title: (p) => `Student waiting for a specialist: ${s(p.studentName)}`,
    body: () => "No employee had free capacity. Assign one manually from the Assignments queue.",
    link: () => "/admin/assignments",
    cta: () => "Open assignments",
  },
  onboarding_completed: {
    title: (p) => `${s(p.studentName)} finished onboarding`,
    body: () => "Onboarding complete. Start applying.",
    link: (p) => `/work/students/${s(p.studentId)}`,
    cta: () => "Start applying",
  },
  daily_digest: {
    title: (p) => `Today: ${s(p.count)} applications sent for you`,
    body: (p) => `${s(p.count)} of ${s(p.target)} today. Top companies: ${s(p.companies) || "—"}.`,
    link: () => "/app/applications",
    cta: () => "See today’s applications",
  },
  status_interview: {
    title: (p) => `Interview: ${s(p.company)}`,
    body: (p) => `${s(p.title)} at ${s(p.company)} — ${s(p.when) || "details on your dashboard"}.`,
    link: (p) => `/app/applications/${s(p.applicationId)}`,
    cta: () => "View interview",
  },
  status_offer: {
    title: (p) => `🎉 Offer from ${s(p.company)}`,
    body: (p) => `Congratulations on the ${s(p.title)} offer from ${s(p.company)}!`,
    link: (p) => `/app/applications/${s(p.applicationId)}`,
  },
  status_update_employee: {
    title: (p) => `${s(p.studentName)}: ${s(p.status)} at ${s(p.company)}`,
    body: (p) => `${s(p.title)} at ${s(p.company)} moved to ${s(p.status)}${p.byStudent ? " (reported by the student — please verify)" : ""}.`,
    link: (p) => `/work/applications?highlight=${s(p.applicationId)}`,
  },
  offer_admin: {
    title: (p) => `Offer: ${s(p.studentName)} → ${s(p.company)}`,
    body: (p) => `${s(p.title)} at ${s(p.company)}.`,
    link: (p) => `/admin/students/${s(p.studentId)}`,
  },
  new_message: {
    title: (p) => `New message from ${s(p.from)}`,
    body: (p) => s(p.preview),
    link: (p) => s(p.link),
    cta: () => "Reply",
    emailOnly: true,
  },
  weekly_report: {
    title: (p) => `Your weekly report: ${s(p.count)} applications`,
    body: (p) => `${s(p.count)} applications, ${s(p.interviews)} interviews and a ${s(p.responseRate)}% response rate last week.`,
    link: () => "/app",
    cta: () => "Open dashboard",
  },
  weekly_summary_admin: {
    title: () => "Weekly delivery summary",
    body: (p) => `${s(p.applications)} applications, ${s(p.interviews)} interviews, ${s(p.offers)} offers last week.`,
    link: () => "/admin/reports",
  },
  renewal_reminder: {
    title: (p) => `Your plan renews in ${s(p.days)} days`,
    body: (p) => `${s(p.plan)} ${p.autoRenew ? "renews automatically" : "ends"} on ${s(p.date)}.`,
    link: () => "/app/billing",
    cta: () => "Manage billing",
    mandatory: true,
  },
  student_expiring: {
    title: (p) => `${s(p.studentName)}’s plan ends in ${s(p.days)} days`,
    body: (p) => `Period ends ${s(p.date)}.`,
    link: (p) => `/work/students/${s(p.studentId)}`,
  },
  leave_request: {
    title: (p) => `Leave request: ${s(p.employeeName)}`,
    body: (p) => `${s(p.type)} · ${s(p.from)} → ${s(p.to)} (${s(p.days)} day(s)). ${s(p.reason)}`,
    link: () => "/admin/leave",
    cta: () => "Review request",
  },
  leave_decision: {
    title: (p) => `Leave ${s(p.decision)}`,
    body: (p) => `${s(p.type)} · ${s(p.from)} → ${s(p.to)}. ${s(p.note)}`,
    link: () => "/work/leave",
  },
  below_target: {
    title: (p) => `${s(p.count)} student(s) below 50% of today’s target`,
    body: (p) => s(p.list),
    link: (p) => s(p.link) || "/work",
  },
  new_lead: {
    title: (p) => `New lead: ${s(p.name)}`,
    body: (p) => `${s(p.source)} · ${s(p.email)} ${s(p.message) ? `— ${s(p.message)}` : ""}`,
    link: () => "/admin/leads",
  },
  credential_access_digest: {
    title: () => "Your saved logins were used today",
    body: (p) => s(p.summary),
    link: () => "/app/vault",
    mandatory: true,
  },
  testimonial_request: {
    title: () => "Would you share your story?",
    body: (p) => `Congratulations again on your role at ${s(p.company)}! A short testimonial helps other job seekers trust us.`,
    link: () => "/contact?topic=story",
    cta: () => "Share my story",
    emailOnly: true,
  },
  mock_interview_booked: {
    title: (p) => `Mock interview booked: ${s(p.when)}`,
    body: (p) => `${s(p.focus)} with ${s(p.with)}.`,
    link: () => "/app/prep",
  },
  generic: {
    title: (p) => s(p.title),
    body: (p) => s(p.body),
    link: (p) => (p.link ? s(p.link) : undefined),
  },
} satisfies Record<string, Template>;

export type NotificationType = keyof typeof TEMPLATES;

export type NotificationPrefs = { email?: Partial<Record<NotificationType, boolean>>; emailAll?: boolean };

export async function notify(
  userId: string,
  type: NotificationType,
  payload: P = {},
  opts: { attachments?: EmailAttachment[]; skipEmail?: boolean; skipInApp?: boolean } = {},
) {
  const tpl = TEMPLATES[type] as Template;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, notificationPrefs: true, deletedAt: true, status: true },
  });
  if (!user || user.deletedAt) return;

  const title = tpl.title(payload);
  const body = tpl.body(payload);
  const link = tpl.link?.(payload);

  if (!tpl.emailOnly && !opts.skipInApp) {
    await db.notification.create({ data: { userId, type, title, body, link: link ?? null } });
  }

  const prefs = (user.notificationPrefs ?? {}) as NotificationPrefs;
  const allowed = tpl.mandatory || (prefs.emailAll !== false && prefs.email?.[type] !== false);
  if (tpl.inAppOnly || opts.skipEmail || !allowed || user.status === "DEACTIVATED") return;

  const overrides = (await getSetting("notificationTemplates"))?.[type];
  const subject = overrides?.subject ?? tpl.subject?.(payload) ?? title;
  try {
    await sendEmail({
      to: user.email,
      subject,
      attachments: opts.attachments,
      content: {
        preview: body.slice(0, 140),
        heading: overrides?.heading ?? title,
        paragraphs: overrides?.body ? [overrides.body, ...(tpl.paragraphs?.(payload) ?? [])] : [body, ...(tpl.paragraphs?.(payload) ?? [])],
        cta: link ? { label: tpl.cta?.(payload) ?? "Open UpayaInd", href: absoluteUrl(link) } : undefined,
      },
    });
  } catch (e) {
    console.error(`notify(${type}) email failed`, e);
  }
}

/** Notify every active manager and admin (e.g. AWAITING assignment, new lead). */
export async function notifyManagers(type: NotificationType, payload: P = {}, roles: ("MANAGER" | "ADMIN")[] = ["MANAGER", "ADMIN"]) {
  const users = await db.user.findMany({ where: { role: { in: roles }, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  await Promise.all(users.map((u) => notify(u.id, type, payload)));
}
