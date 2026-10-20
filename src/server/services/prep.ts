import "server-only";
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/auth/access";
import { UserError } from "@/server/errors";
import { formatInTz } from "@/lib/format";
import { firstName } from "@/lib/utils";
import { audit } from "./audit";
import { notify } from "./notify";
import { renderRichText, videoEmbedUrl } from "./cms";

/**
 * Interview prep for students (SPEC F12): the resource library filtered by the
 * student's target roles and market, "Recommended for your upcoming interview"
 * by tag matching against the interview's job title, mock-interview slot
 * booking (OPEN → SCHEDULED) and scorecards of past mocks.
 */

type Actor = { id: string; role: Role };

export const MOCK_SCORE_KEYS = ["communication", "technical", "structure", "confidence"] as const;
export type MockScores = Partial<Record<(typeof MOCK_SCORE_KEYS)[number], number>>;

const STOP = new Set(["and", "the", "of", "for", "to", "in", "a", "an", "with", "on", "at", "i", "ii", "iii", "jr", "sr", "senior", "junior", "lead", "staff", "principal", "associate"]);

/** "Senior Data Analyst (SQL)" → ["data","analyst","sql"]. Plurals are singularised. */
export function tokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9+#]+/)
        .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
        .filter((w) => w.length > 1 && !STOP.has(w)),
    ),
  ];
}

/** Synonyms so "developer"/"engineer", "behavioral"/"behavioural" etc. match. */
const ALIASES: Record<string, string[]> = {
  developer: ["engineer", "software"],
  engineer: ["developer", "software"],
  swe: ["engineer", "software"],
  sde: ["engineer", "software"],
  analytic: ["analyst", "data"],
  analyst: ["data"],
  scientist: ["data"],
  behavioral: ["behavioural"],
  behavioural: ["behavioral"],
  pm: ["product", "manager"],
};

export function expand(words: string[]) {
  const out = new Set(words);
  for (const w of words) for (const a of ALIASES[w] ?? []) out.add(a);
  return out;
}

/** Pure: score a resource's tags against words (tag "all" counts as a weak match). */
export function matchScore(tags: string[], words: Set<string>) {
  let score = 0;
  for (const raw of tags) {
    const t = raw.toLowerCase().trim();
    if (t === "all") score += 0.25;
    else if (words.has(t) || tokens(t).some((x) => words.has(x))) score += 1;
  }
  return score;
}

type Resource = { id: string; title: string; type: string; tags: string[]; url: string | null; fileKey: string | null; bodyHtml: string | null };

/** Pure: rank resources for a set of words; drops non-matching ones unless `keepAll`. */
export function rankResources<T extends { tags: string[] }>(list: T[], words: Set<string>, opts: { keepAll?: boolean; min?: number } = {}) {
  return list
    .map((r) => ({ r, s: matchScore(r.tags, words) }))
    .filter((x) => opts.keepAll || x.s >= (opts.min ?? 0.25))
    .sort((a, b) => b.s - a.s)
    .map((x) => ({ ...x.r, score: x.s }));
}

async function ownStudent(user: Actor) {
  if (user.role !== "STUDENT") throw new ForbiddenError();
  const s = await db.studentProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, targetTitles: true, coachId: true, user: { select: { timezone: true, name: true } }, market: { select: { code: true } }, coach: { select: { id: true, user: { select: { name: true, status: true, deletedAt: true } } } } },
  });
  if (!s) throw new ForbiddenError();
  return s;
}

export async function getPrepPage(user: Actor, opts: { view?: "mine" | "all" } = {}, now = new Date()) {
  const s = await ownStudent(user);
  const resources: Resource[] = await db.prepResource.findMany({
    where: { isPublished: true, OR: [{ marketCodes: { has: s.market.code } }, { marketCodes: { isEmpty: true } }] },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, title: true, type: true, tags: true, url: true, fileKey: true, bodyHtml: true },
  });
  const roleWords = expand(s.targetTitles.flatMap(tokens));
  const library = opts.view === "all" ? rankResources(resources, roleWords, { keepAll: true }) : rankResources(resources, roleWords);

  const next = await db.interview.findFirst({
    where: { application: { studentId: s.id }, scheduledAt: { gte: now } },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, scheduledAt: true, round: true, application: { select: { id: true, companyName: true, jobTitle: true } } },
  });
  let recommended: { interview: NonNullable<typeof next>; items: (Resource & { score: number })[] } | null = null;
  if (next) {
    const words = expand([...tokens(next.application.jobTitle), ...tokens(next.round)]);
    if (/recruiter|hr/i.test(next.round)) words.add("behavioural");
    const items = rankResources(resources, words, { min: 0.25 }).slice(0, 4);
    recommended = { interview: next, items };
  }

  const [openSlots, mine] = await Promise.all([
    db.mockInterview.findMany({ where: { status: "OPEN", studentId: null, scheduledAt: { gt: now } }, orderBy: { scheduledAt: "asc" }, take: 20, select: { id: true, scheduledAt: true, durationMin: true, focus: true, conductedById: true, coachId: true } }),
    db.mockInterview.findMany({ where: { studentId: s.id }, orderBy: { scheduledAt: "desc" }, take: 30, select: { id: true, scheduledAt: true, durationMin: true, focus: true, status: true, meetingLink: true, scores: true, feedback: true, conductedById: true, coachId: true } }),
  ]);
  const nameOf = await coachFirstNames([...openSlots, ...mine]);
  const withName = <T extends { conductedById: string; coachId: string | null }>(m: T) => {
    const { conductedById, coachId, ...rest } = m;
    return { ...rest, with: nameOf.get(coachId ?? "") ?? nameOf.get(conductedById) ?? null };
  };
  const coachActive = s.coach && s.coach.user.status !== "DEACTIVATED" && !s.coach.user.deletedAt;
  return {
    timezone: s.user.timezone,
    targetTitles: s.targetTitles,
    /** The student's assigned interview coach (D-140), if any. */
    coach: coachActive && s.coach ? { id: s.coach.id, firstName: firstName(s.coach.user.name) } : null,
    library,
    libraryTotal: resources.length,
    recommended,
    openSlots: openSlots.map(withName),
    upcomingMocks: mine.filter((m) => m.status === "SCHEDULED" && m.scheduledAt >= new Date(now.getTime() - 2 * 3600e3)).map(withName).reverse(),
    pastMocks: mine.filter((m) => m.status !== "SCHEDULED" || m.scheduledAt < new Date(now.getTime() - 2 * 3600e3)).map((m) => ({ ...withName(m), scores: parseScores(m.scores) })),
  };
}

/**
 * First names of the people running a set of mocks, keyed by EmployeeProfile id
 * (coachId, D-140) and by the legacy conductedById (an EmployeeProfile id, or a
 * User id in older seed rows).
 */
async function coachFirstNames(rows: { conductedById: string; coachId: string | null }[]) {
  const ids = [...new Set(rows.flatMap((m) => [m.coachId, m.conductedById]).filter((x): x is string => Boolean(x)))];
  const people = ids.length ? await db.employeeProfile.findMany({ where: { OR: [{ id: { in: ids } }, { userId: { in: ids } }] }, select: { id: true, userId: true, user: { select: { name: true } } } }) : [];
  return new Map(people.flatMap((p) => [[p.id, firstName(p.user.name)] as const, [p.userId, firstName(p.user.name)] as const]));
}

export function parseScores(v: unknown): MockScores {
  const r = z.record(z.string(), z.number().min(1).max(5)).safeParse(v);
  if (!r.success) return {};
  return Object.fromEntries(MOCK_SCORE_KEYS.filter((k) => typeof r.data[k] === "number").map((k) => [k, r.data[k]!]));
}

/**
 * Book an OPEN slot (atomic: only one student can claim it). A student may
 * hold at most 2 upcoming mock interviews. Notifies the student and the coach.
 */
export async function bookMockInterview(user: Actor, slotId: string, now = new Date()) {
  const s = await ownStudent(user);
  const upcoming = await db.mockInterview.count({ where: { studentId: s.id, status: "SCHEDULED", scheduledAt: { gte: now } } });
  if (upcoming >= 2) throw new UserError("You already have 2 mock interviews booked. Finish one before booking another.");
  const r = await db.mockInterview.updateMany({ where: { id: slotId, status: "OPEN", studentId: null, scheduledAt: { gt: now } }, data: { status: "SCHEDULED", studentId: s.id } });
  if (r.count === 0) throw new UserError("Sorry, that slot was just taken. Pick another time.");
  const slot = await db.mockInterview.findUniqueOrThrow({ where: { id: slotId }, select: { id: true, scheduledAt: true, focus: true, conductedById: true, coachId: true } });
  const coach = await db.employeeProfile.findFirst({
    where: slot.coachId ? { id: slot.coachId } : { OR: [{ id: slot.conductedById }, { userId: slot.conductedById }] },
    select: { id: true, userId: true, user: { select: { name: true, timezone: true, role: true } } },
  });
  // New bookings always carry the coach's EmployeeProfile id (D-140); legacy slots get it filled in here.
  if (coach && slot.coachId !== coach.id) await db.mockInterview.update({ where: { id: slot.id }, data: { coachId: coach.id } });
  await audit({ actorId: user.id, action: "prep.mock_booked", entity: "MockInterview", entityId: slot.id });
  const focus = slot.focus ?? "Mock interview";
  await notify(user.id, "mock_interview_booked", { when: `${formatInTz(slot.scheduledAt, s.user.timezone, "EEE d MMM, h:mm a")} (your time)`, focus, with: coach ? firstName(coach.user.name) : "your coach" }).catch(() => undefined);
  if (coach) {
    await notify(coach.userId, "generic", { title: `Mock interview booked: ${s.user.name}`, body: `${focus} on ${formatInTz(slot.scheduledAt, coach.user.timezone, "EEE d MMM, h:mm a")}.`, link: coach.user.role === "COACH" ? "/coach/sessions" : "/work/interviews" }).catch(() => undefined);
  }
  return { ...slot, coachId: coach?.id ?? slot.coachId };
}

/** Cancel a booked mock (more than 2 hours ahead): the slot reopens for others. */
export async function cancelMockInterview(user: Actor, mockId: string, now = new Date()) {
  const s = await ownStudent(user);
  const r = await db.mockInterview.updateMany({ where: { id: mockId, studentId: s.id, status: "SCHEDULED", scheduledAt: { gt: new Date(now.getTime() + 2 * 3600e3) } }, data: { status: "OPEN", studentId: null } });
  if (r.count === 0) throw new UserError("This mock interview can't be cancelled anymore (less than 2 hours to go). Message your specialist instead.");
  await audit({ actorId: user.id, action: "prep.mock_cancelled", entity: "MockInterview", entityId: mockId });
}

/** A mock interview of this student (for .ics). */
export async function getStudentMock(user: Actor, mockId: string) {
  const s = await ownStudent(user);
  return db.mockInterview.findFirst({ where: { id: mockId, studentId: s.id, status: "SCHEDULED" }, select: { id: true, scheduledAt: true, durationMin: true, focus: true, meetingLink: true } });
}

/**
 * A single published resource for the student detail view. The body is
 * re-rendered from the Tiptap JSON through the CMS allow-list sanitiser
 * (never trust stored HTML); video URLs are reduced to allowed embeds.
 */
export async function getPrepResource(user: Actor, id: string) {
  const s = await ownStudent(user);
  const r = await db.prepResource.findFirst({
    where: { id, isPublished: true, OR: [{ marketCodes: { has: s.market.code } }, { marketCodes: { isEmpty: true } }] },
    select: { id: true, title: true, type: true, tags: true, url: true, fileKey: true, body: true },
  });
  if (!r) return null;
  let html = "";
  try {
    html = r.body ? renderRichText(r.body, { requireAlt: false }).html : "";
  } catch {
    html = "";
  }
  const file = r.fileKey ? await db.fileObject.findUnique({ where: { key: r.fileKey }, select: { id: true } }) : null;
  return { id: r.id, title: r.title, type: r.type, tags: r.tags, url: r.url, html, embedUrl: r.type === "VIDEO" ? videoEmbedUrl(r.url) : null, fileId: file?.id ?? null };
}
