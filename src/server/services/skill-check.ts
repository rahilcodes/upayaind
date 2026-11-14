import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { db, Prisma } from "@/server/db";
import { assertEmployeeCanAccessStudent, ForbiddenError } from "@/server/auth/access";
import { UserError } from "@/server/errors";
import { allProfileSkills, type ResumeData } from "@/resume/schema";
import { JdAnalysis } from "@/server/ai/schemas";
import { stemmedTokens } from "@/server/ai/stem";
import { audit } from "./audit";
import { notify } from "./notify";
import { parseMaster } from "./resumes";
import { CONFIRMED_SKILLS_GROUP } from "./student-profile";

/**
 * Skill check (D-164). Live data showed that ~99 % of the JD skills missing
 * from tailored resumes are simply absent from the candidates' profiles, so the
 * AI has nothing to surface. This closes the gap truthfully and in bulk:
 *  - the candidate sees the skills employers asked for in the jobs we applied
 *    to and answers each one: "I've used it" / "Basic / learning" / "No";
 *  - "used" goes to the profile's "Additional skills", "basic" to a separate
 *    "Familiar with" group (the resume keeps that label), "no" is remembered
 *    and never asked again;
 *  - a specialist can ask for the check (notification) or record several skills
 *    the candidate confirmed on a call in one go.
 * The candidate stays the only source of what they know.
 */

export class SkillCheckError extends UserError {}

type Actor = { id: string; role: Role };
export const FAMILIAR_GROUP = "Familiar with";
export const SKILL_LEVELS = ["have", "basic", "no"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

const WINDOW_DAYS = 45;
const MAX_ITEMS = 30;
const keyOf = (s: string) => stemmedTokens(s, { dropStopwords: true }).join(" ");
const clean = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();

type Stored = { declined?: string[]; answeredAt?: string };

export type PendingSkill = { skill: string; jobs: number; required: boolean };

/** JD skills from the candidate's recent tailored resumes that their profile lacks and they haven't declined, most requested first. */
export async function pendingSkillCheck(studentId: string): Promise<PendingSkill[]> {
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { masterProfile: true, skillCheck: true } });
  if (!s) return [];
  const { master } = parseMaster(s.masterProfile);
  if (!master) return [];
  const have = new Set(allProfileSkills(master).map(keyOf));
  const declined = new Set(((s.skillCheck as Stored | null)?.declined ?? []).map(String));
  const versions = await db.resumeVersion.findMany({
    where: { studentId, kind: "TAILORED", createdAt: { gte: new Date(Date.now() - WINDOW_DAYS * 86_400_000) } },
    orderBy: { createdAt: "desc" },
    take: 150,
    select: { jdAnalysis: true },
  });
  const tally = new Map<string, PendingSkill>();
  for (const v of versions) {
    const a = JdAnalysis.safeParse(v.jdAnalysis);
    if (!a.success) continue;
    const seen = new Set<string>();
    for (const [list, required] of [[a.data.requiredSkills, true], [a.data.niceToHaveSkills, false]] as const) {
      for (const raw of list) {
        const skill = clean(raw);
        const k = keyOf(skill);
        if (!k || skill.length > 40 || have.has(k) || declined.has(k) || seen.has(k)) continue;
        seen.add(k);
        const cur = tally.get(k);
        if (cur) {
          cur.jobs++;
          cur.required ||= required;
        } else tally.set(k, { skill, jobs: 1, required });
      }
    }
  }
  return [...tally.values()].sort((x, y) => y.jobs - x.jobs || Number(y.required) - Number(x.required) || x.skill.localeCompare(y.skill)).slice(0, MAX_ITEMS);
}

function withSkills(master: ResumeData, group: string, skills: string[]): { content: ResumeData; added: string[] } {
  const existing = new Set(allProfileSkills(master).map(keyOf));
  const groups = master.skills.map((g) => ({ ...g, items: [...g.items] }));
  const added: string[] = [];
  for (const raw of skills) {
    const skill = clean(raw);
    const k = keyOf(skill);
    if (!k || skill.length > 60 || existing.has(k)) continue;
    existing.add(k);
    let target = groups.find((g) => g.group.toLowerCase() === group.toLowerCase());
    if (!target) {
      target = { group, items: [] };
      groups.push(target);
    }
    target.items.push(skill);
    added.push(skill);
  }
  return { content: { ...master, skills: groups }, added };
}

async function assignees(studentId: string) {
  const now = new Date();
  const rows = await db.assignment.findMany({ where: { studentId, isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { employee: { select: { userId: true } } } });
  return [...new Set(rows.map((r) => r.employee.userId))];
}

/** The candidate answers their own skill check. */
export async function answerSkillCheck(user: Actor, answers: { skill: string; level: SkillLevel }[]) {
  if (user.role !== "STUDENT") throw new ForbiddenError();
  const s = await db.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true, masterProfile: true, skillCheck: true, user: { select: { name: true } } } });
  if (!s) throw new ForbiddenError();
  const { master } = parseMaster(s.masterProfile);
  if (!master) throw new SkillCheckError("Complete your profile first.");
  const valid = answers.filter((a) => SKILL_LEVELS.includes(a.level) && clean(a.skill).length > 0 && clean(a.skill).length <= 60).slice(0, 60);
  if (!valid.length) throw new SkillCheckError("Answer at least one skill.");

  const used = withSkills(master, CONFIRMED_SKILLS_GROUP, valid.filter((a) => a.level === "have").map((a) => a.skill));
  const basic = withSkills(used.content, FAMILIAR_GROUP, valid.filter((a) => a.level === "basic").map((a) => a.skill));
  const prev = (s.skillCheck as Stored | null) ?? {};
  const declined = [...new Set([...(prev.declined ?? []), ...valid.filter((a) => a.level === "no").map((a) => keyOf(a.skill)).filter(Boolean)])].slice(-500);
  const stored: Stored = { declined, answeredAt: new Date().toISOString() };

  await db.$transaction(async (tx) => {
    await tx.studentProfile.update({ where: { id: s.id }, data: { masterProfile: basic.content as unknown as Prisma.InputJsonValue, skillCheck: stored as unknown as Prisma.InputJsonValue } });
    await audit({ actorId: user.id, action: "student.skill_check", entity: "StudentProfile", entityId: s.id, after: { used: used.added, basic: basic.added, declined: valid.filter((a) => a.level === "no").map((a) => clean(a.skill)) } }, tx);
  });
  const total = used.added.length + basic.added.length;
  if (total) for (const uid of await assignees(s.id)) await notify(uid, "skills_confirmed_by_student", { studentName: s.user.name, studentId: s.id, count: total }).catch(() => undefined);
  return { used: used.added, basic: basic.added, declined: valid.filter((a) => a.level === "no").length };
}

/** Specialist asks the candidate to do the skill check (at most once every 12 hours). */
export async function requestSkillCheck(user: Actor, studentId: string) {
  if (user.role === "STUDENT") throw new ForbiddenError();
  await assertEmployeeCanAccessStudent(user, studentId);
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { userId: true } });
  if (!s) throw new ForbiddenError();
  const pending = await pendingSkillCheck(studentId);
  if (!pending.length) throw new SkillCheckError("Nothing to ask: every skill from recent job descriptions is already answered.");
  const recent = await db.notification.findFirst({ where: { userId: s.userId, type: "skill_check_requested", createdAt: { gte: new Date(Date.now() - 12 * 3_600_000) } }, select: { id: true } });
  if (recent) throw new SkillCheckError("The applicant was already asked in the last 12 hours.");
  await notify(s.userId, "skill_check_requested", { count: pending.length, examples: pending.slice(0, 4).map((p) => p.skill).join(", ") });
  await audit({ actorId: user.id, action: "student.skill_check_requested", entity: "StudentProfile", entityId: studentId, after: { count: pending.length } });
  return { asked: pending.length };
}

/** Specialist records several skills the candidate confirmed (call / WhatsApp) in one step. Audited with the note; the candidate is notified. */
export async function addConfirmedSkills(user: Actor, studentId: string, raw: { skills: string[]; level?: "have" | "basic"; note: string }) {
  if (user.role === "STUDENT") throw new ForbiddenError();
  await assertEmployeeCanAccessStudent(user, studentId);
  const note = raw.note.trim();
  if (note.length < 5 || note.length > 300) throw new SkillCheckError("Say how the applicant confirmed these (e.g. 'confirmed on a call, 14 Nov').", "note");
  const skills = raw.skills.map(clean).filter(Boolean).slice(0, 30);
  if (!skills.length) throw new SkillCheckError("Pick at least one skill.", "skills");
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { masterProfile: true, userId: true } });
  if (!s) throw new ForbiddenError();
  const { master } = parseMaster(s.masterProfile);
  if (!master) throw new SkillCheckError("The applicant's master profile isn't complete yet.");
  const group = raw.level === "basic" ? FAMILIAR_GROUP : CONFIRMED_SKILLS_GROUP;
  const { content, added } = withSkills(master, group, skills);
  if (!added.length) throw new SkillCheckError("These skills are already in the applicant's profile.", "skills");
  await db.$transaction(async (tx) => {
    await tx.studentProfile.update({ where: { id: studentId }, data: { masterProfile: content as unknown as Prisma.InputJsonValue } });
    await audit({ actorId: user.id, action: "student.skill_confirmed", entity: "StudentProfile", entityId: studentId, after: { skills: added, group, note } }, tx);
  });
  await notify(s.userId, "skill_added_by_specialist", { skill: added.join(", ") }).catch(() => undefined);
  return { added, group };
}
