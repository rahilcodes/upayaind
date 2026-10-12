"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { TZDate } from "@date-fns/tz";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { useServerAction } from "@/components/portal/action-form";
import { addSessionAction, correctDayAction, correctSessionAction } from "./actions";

const STATUSES = ["PRESENT", "HALF_DAY", "ABSENT", "ON_LEAVE", "HOLIDAY", "WEEKEND"] as const;

function toLocal(iso: string | null, tz: string) {
  if (!iso) return "";
  const d = new TZDate(new Date(iso), tz);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocal(v: string, tz: string) {
  if (!v) return null;
  const [date, time] = v.split("T");
  const [y, m, d] = date!.split("-").map(Number);
  const [hh, mm] = (time ?? "0:0").split(":").map(Number);
  return new Date(new TZDate(y!, m! - 1, d!, hh!, mm!, 0, tz).getTime()).toISOString();
}

export function SessionDialog({ session, employeeId, tz, employeeName }: { session?: { id: string; startedAt: string; endedAt: string | null }; employeeId: string; tz: string; employeeName: string }) {
  const t = useTranslations("work.adminAttendance.correct");
  const [open, setOpen] = React.useState(false);
  const fix = useServerAction(correctSessionAction, { onSuccess: () => setOpen(false) });
  const add = useServerAction(addSessionAction, { onSuccess: () => setOpen(false) });
  const fe = { ...fix.fieldErrors, ...add.fieldErrors };
  const id = session?.id ?? `new-${employeeId}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {session ? (
          <Button size="sm" variant="ghost" aria-label={t("editSessionLabel", { name: employeeName })}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>
        ) : (
          <Button size="sm" variant="outline"><Plus className="h-4 w-4" aria-hidden="true" />{t("addSession")}</Button>
        )}
      </DialogTrigger>
      <DialogContent title={session ? t("editSessionTitle", { name: employeeName }) : t("addSessionTitle", { name: employeeName })} description={t("tzNote", { tz })}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const startedAt = fromLocal(String(fd.get("start") ?? ""), tz) ?? "";
            const endedAt = fromLocal(String(fd.get("end") ?? ""), tz);
            const reason = String(fd.get("reason") ?? "");
            if (session) void fix.run({ sessionId: session.id, startedAt, endedAt, reason });
            else void add.run({ employeeId, startedAt, endedAt: endedAt ?? "", reason });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`s-${id}`} label={t("start")} error={fe.startedAt}>
              <Input {...fieldA11y(`s-${id}`, fe.startedAt)} name="start" type="datetime-local" defaultValue={toLocal(session?.startedAt ?? null, tz)} required />
            </Field>
            <Field id={`e-${id}`} label={t("end")} hint={session ? t("endHint") : undefined} error={fe.endedAt}>
              <Input {...fieldA11y(`e-${id}`, fe.endedAt, Boolean(session))} name="end" type="datetime-local" defaultValue={toLocal(session?.endedAt ?? null, tz)} required={!session} />
            </Field>
          </div>
          <Field id={`r-${id}`} label={t("reason")} hint={t("reasonHint")} error={fe.reason}>
            <Textarea {...fieldA11y(`r-${id}`, fe.reason, true)} name="reason" required minLength={3} maxLength={500} rows={2} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button type="submit" loading={fix.pending || add.pending}>{t("save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DayDialog({ employeeId, employeeName, date, status }: { employeeId: string; employeeName: string; date: string; status: string | null }) {
  const t = useTranslations("work.adminAttendance.correct");
  const ta = useTranslations("attendance");
  const [open, setOpen] = React.useState(false);
  const { run, pending, fieldErrors } = useServerAction(correctDayAction, { onSuccess: () => setOpen(false) });
  const id = `${employeeId}-${date}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={t("editDayLabel", { name: employeeName, date })}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>
      </DialogTrigger>
      <DialogContent title={t("editDayTitle", { name: employeeName, date })} description={t("dayNote")}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run({ employeeId, date, status: String(fd.get("status")), reason: String(fd.get("reason") ?? "") });
          }}
        >
          <Field id={`st-${id}`} label={t("status")} error={fieldErrors.status}>
            <Select {...fieldA11y(`st-${id}`, fieldErrors.status)} name="status" defaultValue={status ?? "PRESENT"}>
              {STATUSES.map((s) => <option key={s} value={s}>{ta(s)}</option>)}
            </Select>
          </Field>
          <Field id={`dr-${id}`} label={t("reason")} hint={t("reasonHint")} error={fieldErrors.reason}>
            <Textarea {...fieldA11y(`dr-${id}`, fieldErrors.reason, true)} name="reason" required minLength={3} maxLength={500} rows={2} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button type="submit" loading={pending}>{t("save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
