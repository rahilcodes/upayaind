import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

/** Wipe every table in the test database (fast, keeps the schema). */
export async function resetDb() {
  const rows = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length) await db.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let n = 0;
export const uid = (p = "x") => `${p}${Date.now().toString(36)}${(n++).toString(36)}`;

export async function makeMarket(code = "US") {
  const style = await db.resumeStyle.upsert({
    where: { code: `${code}_STYLE` },
    update: {},
    create: { code: `${code}_STYLE`, name: code, documentTitle: "Resume", pageSize: "LETTER", maxPages: 1, dateFormat: "MMM yyyy", spelling: "en-US", includePhoto: false, includeDob: false, includeNationality: false, includeFullAddress: false, summaryLabel: "Summary", sectionOrder: ["summary", "skills", "experience", "education"], rulesPrompt: "" },
  });
  return db.market.upsert({ where: { code }, update: {}, create: { code, name: code, currency: "USD", minPriceMinor: 4900, defaultTimezone: "America/New_York", resumeStyleId: style.id } });
}

/** Default schedule (D-139 shape): Mon–Fri 09:30–18:30 IST, window not enforced. */
export const TEST_SCHEDULE = { days: [1, 2, 3, 4, 5], startTime: "09:30", endTime: "18:30", hours: 9, timezone: "Asia/Kolkata", enforceWindow: false };

export async function makeEmployee(marketId: string, opts: { maxStudents?: number; accepting?: boolean; status?: "ACTIVE" | "DEACTIVATED"; name?: string; schedule?: Prisma.InputJsonObject } = {}) {
  const u = await db.user.create({
    data: {
      email: `${uid("e")}@t.test`,
      name: opts.name ?? "Emp",
      role: "EMPLOYEE",
      status: opts.status ?? "ACTIVE",
      timezone: "Asia/Kolkata",
      employee: { create: { employeeCode: uid("UPY-"), marketIds: [marketId], maxStudents: opts.maxStudents ?? 8, acceptingNewStudents: opts.accepting ?? true, workSchedule: opts.schedule ?? TEST_SCHEDULE } },
    },
    include: { employee: true },
  });
  return { user: u, employee: u.employee! };
}

/** An interview coach (role COACH, D-140): has an EmployeeProfile but never takes application assignments. */
export async function makeCoach(marketId: string, opts: { name?: string; status?: "ACTIVE" | "DEACTIVATED" } = {}) {
  const u = await db.user.create({
    data: {
      email: `${uid("c")}@t.test`,
      name: opts.name ?? "Kavya Iyer",
      role: "COACH",
      status: opts.status ?? "ACTIVE",
      timezone: "Asia/Kolkata",
      employee: { create: { employeeCode: uid("UPY-"), title: "Interview Coach", marketIds: [marketId], maxStudents: 0, acceptingNewStudents: false, workSchedule: { days: [1, 2, 3, 4, 5], startTime: "09:30", hours: 9 } } },
    },
    include: { employee: true },
  });
  return { user: u, employee: u.employee!, actor: { id: u.id, role: "COACH" as const } };
}

export async function makeStudent(marketId: string, name = "Stu") {
  const u = await db.user.create({
    data: { email: `${uid("s")}@t.test`, name, role: "STUDENT", student: { create: { marketId } } },
    include: { student: true },
  });
  return { user: u, student: u.student! };
}
