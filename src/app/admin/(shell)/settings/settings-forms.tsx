"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { useServerAction } from "@/components/portal/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea, fieldA11y } from "@/components/ui/input";
import { saveBusinessAction, saveGeneralAction, saveTemplateAction } from "./actions";

type General = { autoAssignEnabled: boolean; defaultMaxStudents: number; noResponseDays: number; belowTargetAlertTime: string; aiLimits: { employeePerHour: number; studentPerDay: number } };

export function GeneralForm({ value }: { value: General }) {
  const t = useTranslations("admin.settings");
  const tc = useTranslations("admin.common");
  const { run, pending, fieldErrors } = useServerAction(saveGeneralAction);
  const err = (k: string) => fieldErrors[k];
  return (
    <form
      noValidate
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run({
          autoAssignEnabled: fd.get("autoAssignEnabled") === "on",
          defaultMaxStudents: Number(fd.get("defaultMaxStudents")),
          noResponseDays: Number(fd.get("noResponseDays")),
          belowTargetAlertTime: String(fd.get("belowTargetAlertTime") ?? ""),
          aiLimits: { employeePerHour: Number(fd.get("employeePerHour")), studentPerDay: Number(fd.get("studentPerDay")) },
        });
      }}
    >
      <label className="flex min-h-11 items-start gap-3 sm:col-span-2">
        <Checkbox name="autoAssignEnabled" defaultChecked={value.autoAssignEnabled} className="mt-0.5" />
        <span>
          <span className="block font-semibold">{t("autoAssign")}</span>
          <span className="block text-[13px] text-muted-foreground">{t("autoAssignHint")}</span>
        </span>
      </label>
      <Field id="s-max" label={t("defaultMax")} hint={t("defaultMaxHint")} error={err("defaultMaxStudents")}>
        <Input {...fieldA11y("s-max", err("defaultMaxStudents"), true)} name="defaultMaxStudents" type="number" min={1} max={100} defaultValue={value.defaultMaxStudents} className="tabular" />
      </Field>
      <Field id="s-nr" label={t("noResponseDays")} hint={t("noResponseHint")} error={err("noResponseDays")}>
        <Input {...fieldA11y("s-nr", err("noResponseDays"), true)} name="noResponseDays" type="number" min={7} max={180} defaultValue={value.noResponseDays} className="tabular" />
      </Field>
      <Field id="s-alert" label={t("alertTime")} hint={t("alertTimeHint")} error={err("belowTargetAlertTime")}>
        <Input {...fieldA11y("s-alert", err("belowTargetAlertTime"), true)} name="belowTargetAlertTime" type="time" defaultValue={value.belowTargetAlertTime} />
      </Field>
      <div className="hidden sm:block" />
      <Field id="s-ai-emp" label={t("aiEmployee")} hint={t("aiEmployeeHint")} error={err("aiLimits.employeePerHour") ?? err("aiLimits")}>
        <Input {...fieldA11y("s-ai-emp", err("aiLimits"), true)} name="employeePerHour" type="number" min={1} max={1000} defaultValue={value.aiLimits.employeePerHour} className="tabular" />
      </Field>
      <Field id="s-ai-stu" label={t("aiStudent")} hint={t("aiStudentHint")} error={err("aiLimits.studentPerDay")}>
        <Input {...fieldA11y("s-ai-stu", err("aiLimits.studentPerDay"), true)} name="studentPerDay" type="number" min={1} max={5000} defaultValue={value.aiLimits.studentPerDay} className="tabular" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          {tc("saveChanges")}
        </Button>
      </div>
    </form>
  );
}

export function BusinessForm({ market, value }: { market: { code: string; name: string }; value: { legalName: string; address: string; taxId: string } | null }) {
  const t = useTranslations("admin.settings");
  const tc = useTranslations("admin.common");
  const { run, pending, fieldErrors } = useServerAction(saveBusinessAction);
  const id = market.code.toLowerCase();
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(market.code, { legalName: String(fd.get("legalName") ?? ""), address: String(fd.get("address") ?? ""), taxId: String(fd.get("taxId") ?? "") });
      }}
    >
      <Field id={`b-${id}-name`} label={t("legalName")} error={fieldErrors.legalName}>
        <Input {...fieldA11y(`b-${id}-name`, fieldErrors.legalName)} name="legalName" defaultValue={value?.legalName ?? ""} maxLength={200} />
      </Field>
      <Field id={`b-${id}-tax`} label={t("taxId")} hint={t("taxIdHint")} error={fieldErrors.taxId}>
        <Input {...fieldA11y(`b-${id}-tax`, fieldErrors.taxId, true)} name="taxId" defaultValue={value?.taxId ?? ""} maxLength={120} />
      </Field>
      <Field id={`b-${id}-addr`} label={t("address")} error={fieldErrors.address} className="sm:col-span-2">
        <Textarea {...fieldA11y(`b-${id}-addr`, fieldErrors.address)} name="address" defaultValue={value?.address ?? ""} maxLength={1000} className="min-h-20" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" loading={pending}>
          {tc("save")}
        </Button>
      </div>
    </form>
  );
}

export function TemplateEditor({ tpl, override }: { tpl: { type: string; title: string; body: string; subject: string; mandatory: boolean; inAppOnly: boolean }; override: { subject?: string; heading?: string; body?: string } | null }) {
  const t = useTranslations("admin.settings");
  const tc = useTranslations("admin.common");
  const { run, pending, fieldErrors } = useServerAction(saveTemplateAction);
  const id = tpl.type;
  const has = Boolean(override && (override.subject || override.heading || override.body));
  return (
    <details className="group rounded-[14px] border border-border">
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <code className="text-[13px] font-semibold">{tpl.type}</code>
          <span className="block truncate text-[13px] text-muted-foreground">{tpl.title || "—"}</span>
        </span>
        <span className="flex flex-wrap gap-1">
          {has ? <Badge tone="blue">{t("customised")}</Badge> : null}
          {tpl.mandatory ? <Badge tone="grey">{t("mandatory")}</Badge> : null}
          {tpl.inAppOnly ? <Badge tone="slate">{t("inAppOnly")}</Badge> : null}
        </span>
      </summary>
      <form
        className="grid gap-4 border-t border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(tpl.type, { subject: String(fd.get("subject") ?? ""), heading: String(fd.get("heading") ?? ""), body: String(fd.get("body") ?? "") });
        }}
      >
        <p className="text-[13px] text-muted-foreground">{t("templateHelp")}</p>
        <Field id={`t-${id}-subject`} label={t("subject")} hint={t("defaultValue", { value: tpl.subject || "—" })} error={fieldErrors.subject}>
          <Input {...fieldA11y(`t-${id}-subject`, fieldErrors.subject, true)} name="subject" defaultValue={override?.subject ?? ""} maxLength={200} />
        </Field>
        <Field id={`t-${id}-heading`} label={t("heading")} hint={t("defaultValue", { value: tpl.title || "—" })} error={fieldErrors.heading}>
          <Input {...fieldA11y(`t-${id}-heading`, fieldErrors.heading, true)} name="heading" defaultValue={override?.heading ?? ""} maxLength={200} />
        </Field>
        <Field id={`t-${id}-body`} label={t("body")} hint={t("defaultValue", { value: tpl.body || "—" })} error={fieldErrors.body}>
          <Textarea {...fieldA11y(`t-${id}-body`, fieldErrors.body, true)} name="body" defaultValue={override?.body ?? ""} maxLength={4000} className="min-h-24" />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={pending}>
            {tc("save")}
          </Button>
        </div>
      </form>
    </details>
  );
}
