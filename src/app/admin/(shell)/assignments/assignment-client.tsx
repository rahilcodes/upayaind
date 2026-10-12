"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Wand2, X } from "lucide-react";
import { ReassignDialog, type EmployeeOption } from "@/components/admin/reassign-dialog";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, fieldA11y } from "@/components/ui/input";
import { autoAssignAction, autoAssignAllAction, endCoverAction, manualAssignAction, saveRulesAction } from "./actions";

export function QueueRowActions({ studentId, studentName, options, isAdmin }: { studentId: string; studentName: string; options: EmployeeOption[]; isAdmin: boolean }) {
  const t = useTranslations("admin.reassign");
  const auto = useServerAction(autoAssignAction);
  const manual = React.useCallback((employeeId: string, reason: string, over: boolean) => manualAssignAction(studentId, employeeId, reason, over), [studentId]);
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button size="sm" onClick={() => auto.run(studentId)} loading={auto.pending} aria-label={`${t("auto")}: ${studentName}`}>
        <Wand2 className="h-4 w-4" aria-hidden="true" />
        {t("auto")}
      </Button>
      <ReassignDialog studentName={studentName} currentEmployeeId={null} options={options} isAdmin={isAdmin} action={manual} label={t("assign")} />
    </div>
  );
}

export function AutoAssignAll({ ids }: { ids: string[] }) {
  const t = useTranslations("admin.assignments");
  const { run, pending } = useServerAction(autoAssignAllAction);
  if (ids.length < 2) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => run(ids)} loading={pending}>
      <Wand2 className="h-4 w-4" aria-hidden="true" />
      {t("autoAll", { count: ids.length })}
    </Button>
  );
}

export function RulesForm({ autoAssignEnabled, defaultMaxStudents, editable }: { autoAssignEnabled: boolean; defaultMaxStudents: number; editable: boolean }) {
  const t = useTranslations("admin.assignments");
  const [on, setOn] = React.useState(autoAssignEnabled);
  const [max, setMax] = React.useState(String(defaultMaxStudents));
  const { run, pending, fieldErrors } = useServerAction(saveRulesAction);
  const dirty = on !== autoAssignEnabled || Number(max) !== defaultMaxStudents;
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(on, Number(max));
      }}
    >
      <label className="flex min-h-11 items-start gap-3">
        <Checkbox checked={on} onChange={(e) => setOn(e.target.checked)} disabled={!editable} className="mt-0.5" />
        <span>
          <span className="block font-semibold">{t("autoToggle")}</span>
          <span className="block text-[13px] text-muted-foreground">{on ? t("autoOnHint") : t("autoOffHint")}</span>
        </span>
      </label>
      <Field id="rules-max" label={t("defaultMax")} hint={t("defaultMaxHint")} error={fieldErrors.defaultMaxStudents}>
        <Input {...fieldA11y("rules-max", fieldErrors.defaultMaxStudents, true)} type="number" min={1} max={100} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} disabled={!editable} className="tabular w-32" />
      </Field>
      {editable ? (
        <div>
          <Button type="submit" size="sm" loading={pending} disabled={!dirty}>
            {t("saveRules")}
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">{t("rulesAdminOnly")}</p>
      )}
    </form>
  );
}

export function EndCoverButton({ id, label }: { id: string; label: string }) {
  const t = useTranslations("admin.assignments");
  const { run, pending } = useServerAction(endCoverAction);
  return (
    <Button variant="ghost" size="sm" onClick={() => run(id)} loading={pending} aria-label={label}>
      <X className="h-4 w-4" aria-hidden="true" />
      {t("endCover")}
    </Button>
  );
}
