"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Mail, Power, RotateCcw, ShieldOff } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { deactivateEmployeeAction, reactivateEmployeeAction, resendInviteAction, resetTwoFactorAction } from "./actions";

export function ResendInviteButton({ employeeId, name }: { employeeId: string; name: string }) {
  const t = useTranslations("admin.employees");
  const { run, pending } = useServerAction(resendInviteAction);
  return (
    <Button variant="ghost" size="sm" onClick={() => run(employeeId)} loading={pending} aria-label={t("resendFor", { name })}>
      <Mail className="h-4 w-4" aria-hidden="true" />
      {t("resend")}
    </Button>
  );
}

export function DeactivateButton({ employeeId, name, students }: { employeeId: string; name: string; students: number }) {
  const t = useTranslations("admin.employees");
  const action = React.useCallback((reason: string) => deactivateEmployeeAction(employeeId, reason), [employeeId]);
  return (
    <ConfirmAction
      trigger={<><Power className="h-4 w-4" aria-hidden="true" />{t("deactivate")}</>}
      triggerLabel={t("deactivateFor", { name })}
      title={t("deactivateTitle", { name })}
      description={students ? t("deactivateBodyStudents", { count: students }) : t("deactivateBody")}
      confirmLabel={t("deactivate")}
      reasonLabel={t("deactivateReason")}
      action={action}
    />
  );
}

export function ReactivateButton({ employeeId }: { employeeId: string }) {
  const t = useTranslations("admin.employees");
  const { run, pending } = useServerAction(reactivateEmployeeAction);
  return (
    <Button variant="outline" size="sm" onClick={() => run(employeeId)} loading={pending}>
      <RotateCcw className="h-4 w-4" aria-hidden="true" />
      {t("reactivate")}
    </Button>
  );
}

/** ADMIN only (D-123). */
export function ResetTwoFactorButton({ employeeId, name }: { employeeId: string; name: string }) {
  const t = useTranslations("admin.employees");
  const action = React.useCallback(() => resetTwoFactorAction(employeeId), [employeeId]);
  return (
    <ConfirmAction
      trigger={<><ShieldOff className="h-4 w-4" aria-hidden="true" />{t("reset2fa")}</>}
      triggerLabel={t("reset2faFor", { name })}
      title={t("reset2faTitle", { name })}
      description={t("reset2faBody")}
      confirmLabel={t("reset2fa")}
      action={action}
    />
  );
}
