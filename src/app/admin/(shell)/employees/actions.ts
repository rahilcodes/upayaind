"use server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireAction } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { createEmployee, deactivateEmployee, reactivateEmployee, resendInvite, updateEmployee, type EmployeeInput } from "@/server/services/employees";

/** Employee management (MANAGER + ADMIN; only ADMIN may create/edit managers — enforced in the service). */

export async function createEmployeeAction(input: EmployeeInput) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("employee.manage");
    return createEmployee(user, input);
  }, t("employeeCreated"));
}

export async function updateEmployeeAction(input: EmployeeInput & { employeeId: string }) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("employee.manage");
    return updateEmployee(user, input);
  }, t("employeeSaved"));
}

export async function resendInviteAction(employeeId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("employee.manage");
    return resendInvite(user, z.string().min(1).parse(employeeId));
  }, t("inviteSent"));
}

export async function deactivateEmployeeAction(employeeId: string, reason: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("employee.manage");
    const input = z.object({ employeeId: z.string().min(1), reason: z.string().trim().min(3, "Add a short reason.").max(500) }).parse({ employeeId, reason });
    return deactivateEmployee(user, input.employeeId, input.reason);
  }, t("deactivated"));
}

export async function reactivateEmployeeAction(employeeId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("employee.manage");
    return reactivateEmployee(user, z.string().min(1).parse(employeeId));
  }, t("reactivated"));
}
