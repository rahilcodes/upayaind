"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { useServerAction } from "@/components/portal/action-form";
import { applyLeaveAction, cancelLeaveAction } from "./actions";

type TypeOpt = { id: string; name: string; available: number | null };

export function LeaveForm({ types, minDate }: { types: TypeOpt[]; minDate: string }) {
  const t = useTranslations("work.leave.form");
  const formRef = React.useRef<HTMLFormElement>(null);
  const [typeId, setTypeId] = React.useState(types[0]?.id ?? "");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [half, setHalf] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(applyLeaveAction, {
    onSuccess: () => {
      formRef.current?.reset();
      setFrom("");
      setTo("");
      setHalf("");
    },
  });
  const type = types.find((x) => x.id === typeId);
  const single = !to || to === from;

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (!fd.get("to")) fd.set("to", String(fd.get("from") ?? ""));
        void run(fd);
      }}
      className="grid gap-4"
      noValidate
    >
      <Field id="l-type" label={t("type")} error={fieldErrors.leaveTypeId} hint={type ? (type.available === null ? t("unlimited") : t("available", { days: type.available })) : undefined}>
        <Select {...fieldA11y("l-type", fieldErrors.leaveTypeId, true)} name="leaveTypeId" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="l-from" label={t("from")} error={fieldErrors.from}>
          <Input {...fieldA11y("l-from", fieldErrors.from)} name="from" type="date" min={minDate} value={from} onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value); }} required />
        </Field>
        <Field id="l-to" label={t("to")} error={fieldErrors.to}>
          <Input {...fieldA11y("l-to", fieldErrors.to)} name="to" type="date" min={from || minDate} value={to} onChange={(e) => { setTo(e.target.value); if (e.target.value !== from) setHalf(""); }} required />
        </Field>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">{t("halfDay")}</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {[["", t("fullDay")], ["FIRST", t("firstHalf")], ["SECOND", t("secondHalf")]].map(([v, l]) => (
            <label key={v} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] px-3 text-sm font-medium ${half === v ? "border-primary bg-accent text-accent-foreground" : "border-border-strong"} ${v && !single ? "cursor-not-allowed opacity-50" : ""}`}>
              <input type="radio" name="halfDay" value={v} checked={half === v} disabled={Boolean(v) && !single} onChange={() => setHalf(v!)} className="accent-[var(--primary)]" />
              {l}
            </label>
          ))}
        </div>
        {fieldErrors.halfDay ? <p role="alert" className="text-[13px] font-medium text-danger">{fieldErrors.halfDay[0]}</p> : <p className="text-[13px] text-muted-foreground">{t("halfHint")}</p>}
      </fieldset>
      <Field id="l-reason" label={t("reason")} error={fieldErrors.reason}>
        <Textarea {...fieldA11y("l-reason", fieldErrors.reason)} name="reason" maxLength={1000} rows={3} required />
      </Field>
      <Field id="l-file" label={t("attachment")} hint={t("attachmentHint")} error={fieldErrors.attachment}>
        <Input {...fieldA11y("l-file", fieldErrors.attachment, true)} name="attachment" type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" className="h-auto py-2.5" />
      </Field>
      <div>
        <Button type="submit" loading={pending} disabled={!types.length}>{t("submit")}</Button>
      </div>
    </form>
  );
}

export function CancelLeaveButton({ id, label }: { id: string; label: string }) {
  const t = useTranslations("work.leave");
  const [confirm, setConfirm] = React.useState(false);
  const { run, pending } = useServerAction(cancelLeaveAction);
  if (!confirm) return <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} aria-label={label}>{t("cancel")}</Button>;
  return (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="danger" loading={pending} onClick={() => run(id)}>{t("confirmCancel")}</Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>{t("keep")}</Button>
    </span>
  );
}
