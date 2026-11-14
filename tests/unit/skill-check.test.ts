import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addConfirmedSkills, answerSkillCheck, FAMILIAR_GROUP, pendingSkillCheck, requestSkillCheck } from "@/server/services/skill-check";
import { CONFIRMED_SKILLS_GROUP } from "@/server/services/student-profile";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";
import { ANALYSIS, MASTER, clone } from "./resume-fixtures";

/** Skill check (D-164): candidates confirm the JD skills their profile lacks; nothing is added without their answer. */
beforeEach(resetDb);

async function setup() {
  const m = await makeMarket();
  const s = await makeStudent(m.id);
  await db.studentProfile.update({ where: { id: s.student.id }, data: { masterProfile: { ...clone(MASTER), basics: { ...MASTER.basics, email: s.user.email } } as never } });
  const e = await makeEmployee(m.id);
  await db.assignment.create({ data: { studentId: s.student.id, employeeId: e.employee.id, type: "PRIMARY", source: "MANUAL", isActive: true } });
  const jd = (required: string[], nice: string[] = []) =>
    db.resumeVersion.create({ data: { studentId: s.student.id, kind: "TAILORED", title: "QA Engineer", content: clone(MASTER) as never, jdAnalysis: { ...ANALYSIS, requiredSkills: required, niceToHaveSkills: nice } as never, createdById: e.user.id, styleCode: "US_RESUME", templateCode: "classic" } });
  return { s, e, jd, student: { id: s.user.id, role: "STUDENT" as const }, emp: { id: e.user.id, role: "EMPLOYEE" as const } };
}

const groups = async (studentId: string) => ((await db.studentProfile.findUniqueOrThrow({ where: { id: studentId }, select: { masterProfile: true } })).masterProfile as { skills: { group: string; items: string[] }[] }).skills;

describe("pendingSkillCheck", () => {
  it("lists JD skills the profile lacks, most requested first, and skips what the profile already has", async () => {
    const { s, jd } = await setup();
    await jd(["SQL", "Playwright", "TypeScript"], ["Cypress"]);
    await jd(["Playwright", "JavaScript"]);
    const pending = await pendingSkillCheck(s.student.id);
    expect(pending[0]).toMatchObject({ skill: "Playwright", jobs: 2, required: true });
    expect(pending.map((p) => p.skill)).toEqual(expect.arrayContaining(["TypeScript", "JavaScript", "Cypress"]));
    expect(pending.map((p) => p.skill)).not.toContain("SQL"); // already in the profile
    expect(pending.find((p) => p.skill === "Cypress")?.required).toBe(false);
  });
});

describe("answerSkillCheck", () => {
  it("adds used skills, lists basic ones under Familiar with, remembers No, notifies the specialist", async () => {
    const { s, e, jd, student, emp } = await setup();
    await jd(["Playwright", "TypeScript", "Kubernetes"]);
    await expect(answerSkillCheck(emp, [{ skill: "Playwright", level: "have" }])).rejects.toThrow();
    const r = await answerSkillCheck(student, [
      { skill: "Playwright", level: "have" },
      { skill: "TypeScript", level: "basic" },
      { skill: "Kubernetes", level: "no" },
    ]);
    expect(r).toMatchObject({ used: ["Playwright"], basic: ["TypeScript"], declined: 1 });
    const g = await groups(s.student.id);
    expect(g.find((x) => x.group === CONFIRMED_SKILLS_GROUP)?.items).toEqual(["Playwright"]);
    expect(g.find((x) => x.group === FAMILIAR_GROUP)?.items).toEqual(["TypeScript"]);
    expect(JSON.stringify(g)).not.toContain("Kubernetes");
    // Nothing left to ask: answered skills are in the profile, the declined one is remembered.
    expect(await pendingSkillCheck(s.student.id)).toEqual([]);
    expect(await db.auditLog.count({ where: { action: "student.skill_check", entityId: s.student.id } })).toBe(1);
    expect(await db.notification.count({ where: { userId: e.user.id, type: "skills_confirmed_by_student" } })).toBe(1);
  });
});

describe("specialist actions", () => {
  it("asks at most once per 12 hours and only when something is pending", async () => {
    const { s, jd, emp, student } = await setup();
    await expect(requestSkillCheck(emp, s.student.id)).rejects.toThrow(/Nothing to ask/);
    await jd(["Playwright"]);
    await expect(requestSkillCheck(student, s.student.id)).rejects.toThrow();
    expect(await requestSkillCheck(emp, s.student.id)).toEqual({ asked: 1 });
    expect(await db.notification.count({ where: { userId: s.user.id, type: "skill_check_requested" } })).toBe(1);
    await expect(requestSkillCheck(emp, s.student.id)).rejects.toThrow(/already asked/);
  });

  it("adds several confirmed skills with a note; unassigned staff and students are refused", async () => {
    const { s, emp, student } = await setup();
    const m = await db.market.findFirstOrThrow();
    const other = await makeEmployee(m.id);
    await expect(addConfirmedSkills({ id: other.user.id, role: "EMPLOYEE" }, s.student.id, { skills: ["Git"], note: "confirmed on a call" })).rejects.toThrow();
    await expect(addConfirmedSkills(student, s.student.id, { skills: ["Git"], note: "confirmed on a call" })).rejects.toThrow();
    await expect(addConfirmedSkills(emp, s.student.id, { skills: ["Git"], note: "ok" })).rejects.toThrow(/confirmed/);
    const r = await addConfirmedSkills(emp, s.student.id, { skills: ["Git", "JSON", "SQL"], note: "Confirmed on a call, 14 Nov" });
    expect(r.added).toEqual(["Git", "JSON"]); // SQL was already there
    const r2 = await addConfirmedSkills(emp, s.student.id, { skills: ["Docker"], level: "basic", note: "Says basic knowledge only" });
    expect(r2.group).toBe(FAMILIAR_GROUP);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "student.skill_confirmed", entityId: s.student.id }, orderBy: { at: "asc" } });
    expect(log.after).toMatchObject({ skills: ["Git", "JSON"], note: "Confirmed on a call, 14 Nov" });
    expect(await db.notification.count({ where: { userId: s.user.id, type: "skill_added_by_specialist" } })).toBe(2);
  });
});
