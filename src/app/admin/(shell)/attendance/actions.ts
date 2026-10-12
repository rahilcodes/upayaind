"use server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { requestMeta } from "@/server/request";
import { addSession, correctDay, correctSession } from "@/server/services/attendance";
import { AttendanceStatus } from "@/generated/prisma/enums";

const reason = z.string().trim().min(3, "Add a reason for the correction.").max(500);
const iso = z.coerce.date({ error: "Enter a valid date and time." });

export async function correctSessionAction(input: { sessionId: string; startedAt: string; endedAt: string | null; reason: string }) {
  const t = await getTranslations("work.adminAttendance.toasts");
  return safeAction(async () => {
    const user = await requireRole(["MANAGER", "ADMIN"]);
    const v = z.object({ sessionId: z.string().min(1).max(64), startedAt: iso, endedAt: iso.nullable(), reason }).parse(input);
    const { ip } = await requestMeta().catch(() => ({ ip: null }));
    return correctSession(user, { ...v, ip });
  }, t("session"));
}

export async function addSessionAction(input: { employeeId: string; startedAt: string; endedAt: string; reason: string }) {
  const t = await getTranslations("work.adminAttendance.toasts");
  return safeAction(async () => {
    const user = await requireRole(["MANAGER", "ADMIN"]);
    const v = z.object({ employeeId: z.string().min(1).max(64), startedAt: iso, endedAt: iso, reason }).parse(input);
    const { ip } = await requestMeta().catch(() => ({ ip: null }));
    return addSession(user, { ...v, ip });
  }, t("added"));
}

export async function correctDayAction(input: { employeeId: string; date: string; status: string; reason: string }) {
  const t = await getTranslations("work.adminAttendance.toasts");
  return safeAction(async () => {
    const user = await requireRole(["MANAGER", "ADMIN"]);
    const v = z.object({ employeeId: z.string().min(1).max(64), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(Object.values(AttendanceStatus) as [AttendanceStatus, ...AttendanceStatus[]]), reason }).parse(input);
    const { ip } = await requestMeta().catch(() => ({ ip: null }));
    await correctDay(user, { ...v, ip });
    return null;
  }, t("day"));
}
