"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Shuffle } from "lucide-react";
import { useServerAction } from "@/components/portal/action-form";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox, Field, Select, Textarea, fieldA11y } from "@/components/ui/input";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export type EmployeeOption = { id: string; name: string; code: string; active: number; max: number; accepting: boolean };
type Result = { ok: true; data?: unknown; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * Manual assign / reassign (F2): employee dropdown shows load/max; a reason is
 * required. Admins may tick "allow over capacity".
 */
export function ReassignDialog({
  studentName,
  currentEmployeeId,
  options,
  isAdmin,
  action,
  label,
  variant = "outline",
  size = "sm",
}: {
  studentName: string;
  currentEmployeeId: string | null;
  options: EmployeeOption[];
  isAdmin: boolean;
  action: (employeeId: string, reason: string, allowOverCapacity: boolean) => Promise<Result>;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const t = useTranslations("admin.reassign");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [emp, setEmp] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [over, setOver] = React.useState(false);
  const { run, pending, fieldErrors } = useServerAction(action, { onSuccess: () => setOpen(false) });
  const choices = options.filter((o) => o.id !== currentEmployeeId);
  const picked = choices.find((o) => o.id === emp);
  const full = picked ? picked.active >= picked.max : false;
  const uid = React.useId().replace(/:/g, "");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          const best = [...choices].filter((c) => c.active < c.max && c.accepting).sort((a, b) => a.active / Math.max(1, a.max) - b.active / Math.max(1, b.max))[0];
          setEmp(best?.id ?? "");
          setReason(currentEmployeeId ? "" : t("defaultReason"));
          setOver(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <Shuffle className="h-4 w-4" aria-hidden="true" />
          {label ?? (currentEmployeeId ? t("reassign") : t("assign"))}
        </Button>
      </DialogTrigger>
      <DialogContent title={currentEmployeeId ? t("titleReassign", { name: studentName }) : t("titleAssign", { name: studentName })} description={t("description")}>
        {choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noOptions")}</p>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!emp) return;
              run(emp, reason.trim(), over);
            }}
          >
            <Field id={`emp-${uid}`} label={t("employee")} error={fieldErrors.employeeId} hint={picked ? t("loadHint", { active: picked.active, max: picked.max }) : undefined}>
              <Select {...fieldA11y(`emp-${uid}`, fieldErrors.employeeId, Boolean(picked))} value={emp} onChange={(e) => setEmp(e.target.value)} required>
                <option value="" disabled>
                  {t("pick")}
                </option>
                {choices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {`${o.name} (${o.code}) — ${o.active}/${o.max}${o.active >= o.max ? ` · ${tc("atCapacity")}` : ""}${!o.accepting ? ` · ${t("notAccepting")}` : ""}`}
                  </option>
                ))}
              </Select>
            </Field>
            {full ? (
              <div role="status" className="rounded-[12px] border border-[#F2D9A6] bg-[#FDF3E1] px-4 py-3 text-sm text-[#7A4E0E]">
                {isAdmin ? (
                  <label className="flex items-start gap-2">
                    <Checkbox checked={over} onChange={(e) => setOver(e.target.checked)} className="mt-0.5" />
                    <span>{t("overCapacityAdmin")}</span>
                  </label>
                ) : (
                  t("overCapacity")
                )}
              </div>
            ) : null}
            <Field id={`reason-${uid}`} label={t("reason")} hint={t("reasonHint")} error={fieldErrors.reason}>
              <Textarea {...fieldA11y(`reason-${uid}`, fieldErrors.reason, true)} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-20" required />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" loading={pending} disabled={!emp || reason.trim().length < 3 || (full && !(isAdmin && over))}>
                {currentEmployeeId ? t("confirmReassign") : t("confirmAssign")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
