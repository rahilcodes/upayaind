"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { TZDate } from "@date-fns/tz";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { useServerAction } from "@/components/portal/action-form";
import { addInterviewAction, updateInterviewAction } from "./actions";

const ROUNDS = ["Recruiter screen", "Technical", "Hiring manager", "Panel", "HR", "Final", "Other"] as const;
const MODES = ["Phone", "Video", "Onsite"] as const;

export type InterviewEdit = {
  id: string;
  scheduledAt: string;
  timezone: string;
  round: string;
  mode: string;
  meetingLink: string | null;
  interviewers: string | null;
  prepNotes: string | null;
  outcome: string | null;
};

/** "datetime-local" value for an instant in a zone, and back. */
function toLocalInput(iso: string, tz: string) {
  const d = new TZDate(new Date(iso), tz);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(v: string, tz: string) {
  const [date, time] = v.split("T");
  const [y, m, d] = date!.split("-").map(Number);
  const [hh, mm] = (time ?? "00:00").split(":").map(Number);
  return new Date(new TZDate(y!, m! - 1, d!, hh!, mm!, 0, tz).getTime());
}

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "Europe/London", "Asia/Kolkata", "UTC"];

export function InterviewDialog({ apps, interview, defaultTz, defaultAppId }: { apps?: { id: string; label: string }[]; interview?: InterviewEdit; defaultTz: string; defaultAppId?: string }) {
  const t = useTranslations("work.interviews.form");
  const [open, setOpen] = React.useState(false);
  const [tz, setTz] = React.useState(interview?.timezone ?? defaultTz);
  const add = useServerAction(addInterviewAction, { onSuccess: () => setOpen(false) });
  const upd = useServerAction(updateInterviewAction, { onSuccess: () => setOpen(false) });
  const pending = add.pending || upd.pending;
  const fe = { ...add.fieldErrors, ...upd.fieldErrors };
  const zones = ZONES.includes(tz) ? ZONES : [tz, ...ZONES];

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const when = String(fd.get("when") ?? "");
    const input = {
      scheduledAt: when ? fromLocalInput(when, tz) : (undefined as unknown as Date),
      timezone: tz,
      round: String(fd.get("round")) as (typeof ROUNDS)[number],
      mode: String(fd.get("mode")) as (typeof MODES)[number],
      meetingLink: String(fd.get("meetingLink") ?? "") || null,
      interviewers: String(fd.get("interviewers") ?? "") || null,
      prepNotes: String(fd.get("prepNotes") ?? "") || null,
    };
    if (interview) void upd.run(interview.id, { ...input, outcome: String(fd.get("outcome") ?? "") || null });
    else void add.run(String(fd.get("applicationId") ?? ""), input);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {interview ? (
          <Button size="sm" variant="outline"><Pencil className="h-4 w-4" aria-hidden="true" />{t("edit")}</Button>
        ) : (
          <Button><Plus className="h-4 w-4" aria-hidden="true" />{t("add")}</Button>
        )}
      </DialogTrigger>
      <DialogContent title={interview ? t("editTitle") : t("addTitle")} description={interview ? undefined : t("addDescription")} wide>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          {!interview ? (
            <Field id="i-app" label={t("application")} error={fe.applicationId} className="sm:col-span-2">
              <Select {...fieldA11y("i-app", fe.applicationId)} name="applicationId" defaultValue={defaultAppId ?? ""} required>
                <option value="" disabled>{t("pickApplication")}</option>
                {(apps ?? []).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field id="i-when" label={t("when")} error={fe.scheduledAt}>
            <Input {...fieldA11y("i-when", fe.scheduledAt)} name="when" type="datetime-local" required defaultValue={interview ? toLocalInput(interview.scheduledAt, interview.timezone) : ""} />
          </Field>
          <Field id="i-tz" label={t("timezone")} hint={t("timezoneHint")} error={fe.timezone}>
            <Select {...fieldA11y("i-tz", fe.timezone, true)} value={tz} onChange={(e) => setTz(e.target.value)}>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </Select>
          </Field>
          <Field id="i-round" label={t("round")} error={fe.round}>
            <Select {...fieldA11y("i-round", fe.round)} name="round" defaultValue={interview?.round ?? "Recruiter screen"}>
              {ROUNDS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field id="i-mode" label={t("mode")} error={fe.mode}>
            <Select {...fieldA11y("i-mode", fe.mode)} name="mode" defaultValue={interview?.mode ?? "Video"}>
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field id="i-link" label={t("link")} error={fe.meetingLink} className="sm:col-span-2">
            <Input {...fieldA11y("i-link", fe.meetingLink)} name="meetingLink" type="url" inputMode="url" defaultValue={interview?.meetingLink ?? ""} placeholder="https://" />
          </Field>
          <Field id="i-people" label={t("interviewers")} error={fe.interviewers} className="sm:col-span-2">
            <Input {...fieldA11y("i-people", fe.interviewers)} name="interviewers" defaultValue={interview?.interviewers ?? ""} maxLength={500} />
          </Field>
          <Field id="i-notes" label={t("prep")} error={fe.prepNotes} className="sm:col-span-2">
            <Textarea {...fieldA11y("i-notes", fe.prepNotes)} name="prepNotes" defaultValue={interview?.prepNotes ?? ""} maxLength={5000} rows={3} />
          </Field>
          {interview ? (
            <Field id="i-outcome" label={t("outcome")} hint={t("outcomeHint")} error={fe.outcome} className="sm:col-span-2">
              <Input {...fieldA11y("i-outcome", fe.outcome, true)} name="outcome" defaultValue={interview.outcome ?? ""} maxLength={500} />
            </Field>
          ) : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button type="submit" loading={pending}>{t("save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
