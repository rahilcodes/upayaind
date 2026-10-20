"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus, ClipboardCheck, UserPlus, X } from "lucide-react";
import { useServerAction } from "@/components/portal/action-form";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { cancelSessionAction, publishSlotsAction, recordOutcomeAction, scheduleSessionAction } from "../actions";

export type Applicant = { id: string; name: string; timezone: string };

/** Publish consecutive open slots (same rules as the admin slot form, but always "run by me"). */
export function PublishSlotsDialog({ timezone, variant = "outline" }: { timezone: string; variant?: ButtonProps["variant"] }) {
  const t = useTranslations("coach.sessions.publish");
  const tc = useTranslations("coach.common");
  const [open, setOpen] = React.useState(false);
  const { run, pending, fieldErrors } = useServerAction(publishSlotsAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("title")} description={t("description", { tz: timezone })}>
        <form
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const when = String(fd.get("when") ?? "");
            run({
              scheduledAt: when ? new Date(when).toISOString() : "",
              durationMin: Number(fd.get("duration") ?? 45),
              focus: String(fd.get("focus") ?? ""),
              meetingLink: String(fd.get("link") ?? ""),
              count: Number(fd.get("count") ?? 1),
            });
          }}
        >
          <Field id="pub-focus" label={t("focus")} error={fieldErrors.focus} className="sm:col-span-2">
            <Input {...fieldA11y("pub-focus", fieldErrors.focus)} name="focus" placeholder={t("focusPlaceholder")} maxLength={160} />
          </Field>
          <Field id="pub-when" label={t("firstSlot")} error={fieldErrors.scheduledAt}>
            <Input {...fieldA11y("pub-when", fieldErrors.scheduledAt)} name="when" type="datetime-local" />
          </Field>
          <Field id="pub-dur" label={t("duration")} error={fieldErrors.durationMin}>
            <Select id="pub-dur" name="duration" defaultValue="45">
              {[30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {tc("minutes", { n: m })}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="pub-count" label={t("count")} hint={t("countHint")} error={fieldErrors.count}>
            <Input {...fieldA11y("pub-count", fieldErrors.count, true)} name="count" type="number" min={1} max={10} defaultValue={1} className="tabular" />
          </Field>
          <Field id="pub-link" label={t("meetingLink")} error={fieldErrors.meetingLink}>
            <Input {...fieldA11y("pub-link", fieldErrors.meetingLink)} name="link" type="url" placeholder="https://" />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Book a session directly for one of my applicants (SCHEDULED straight away; the student is notified). */
export function ScheduleSessionDialog({ applicants, timezone, presetStudentId, variant = "primary" }: { applicants: Applicant[]; timezone: string; presetStudentId?: string; variant?: ButtonProps["variant"] }) {
  const t = useTranslations("coach.sessions.schedule");
  const tc = useTranslations("coach.common");
  const [open, setOpen] = React.useState(false);
  const { run, pending, fieldErrors } = useServerAction(scheduleSessionAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("title")} description={t("description", { tz: timezone })}>
        {applicants.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noApplicants")}</p>
        ) : (
          <form
            noValidate
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const when = String(fd.get("when") ?? "");
              run({
                studentId: String(fd.get("student") ?? ""),
                scheduledAt: when ? new Date(when).toISOString() : "",
                durationMin: Number(fd.get("duration") ?? 45),
                focus: String(fd.get("focus") ?? ""),
                meetingLink: String(fd.get("link") ?? ""),
                notes: String(fd.get("notes") ?? ""),
              });
            }}
          >
            <Field id="sch-student" label={t("applicant")} error={fieldErrors.studentId} className="sm:col-span-2">
              <Select {...fieldA11y("sch-student", fieldErrors.studentId)} name="student" defaultValue={presetStudentId ?? ""}>
                <option value="" disabled>
                  {t("pickApplicant")}
                </option>
                {applicants.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="sch-focus" label={t("focus")} error={fieldErrors.focus} className="sm:col-span-2">
              <Input {...fieldA11y("sch-focus", fieldErrors.focus)} name="focus" maxLength={160} />
            </Field>
            <Field id="sch-when" label={t("when")} error={fieldErrors.scheduledAt}>
              <Input {...fieldA11y("sch-when", fieldErrors.scheduledAt)} name="when" type="datetime-local" />
            </Field>
            <Field id="sch-dur" label={t("duration")} error={fieldErrors.durationMin}>
              <Select id="sch-dur" name="duration" defaultValue="45">
                {[30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {tc("minutes", { n: m })}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="sch-link" label={t("meetingLink")} error={fieldErrors.meetingLink} className="sm:col-span-2">
              <Input {...fieldA11y("sch-link", fieldErrors.meetingLink)} name="link" type="url" placeholder="https://" />
            </Field>
            <Field id="sch-notes" label={t("notes")} hint={t("notesHint")} error={fieldErrors.notes} className="sm:col-span-2">
              <Textarea {...fieldA11y("sch-notes", fieldErrors.notes, true)} name="notes" maxLength={5000} className="min-h-20" />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" loading={pending}>
                {t("submit")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

const SCORE_KEYS = ["communication", "technical", "structure", "confidence"] as const;

/** Scorecard + feedback (shared with the student) + private notes. */
export function OutcomeDialog({ id, studentName, focus, initialNotes }: { id: string; studentName: string; focus: string | null; initialNotes: string | null }) {
  const t = useTranslations("coach.sessions.outcome");
  const tc = useTranslations("coach.common");
  const [open, setOpen] = React.useState(false);
  const [outcome, setOutcome] = React.useState<"DONE" | "NO_SHOW">("DONE");
  const [scores, setScores] = React.useState<Record<(typeof SCORE_KEYS)[number], number>>({ communication: 3, technical: 3, structure: 3, confidence: 3 });
  const [feedback, setFeedback] = React.useState("");
  const [notes, setNotes] = React.useState(initialNotes ?? "");
  const { run, pending, fieldErrors } = useServerAction(recordOutcomeAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t("buttonFor", { name: studentName })}>
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("title")} description={`${studentName}${focus ? ` · ${focus}` : ""}`}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run({ id, outcome, scores: outcome === "DONE" ? scores : null, feedback: feedback || null, notes: notes || null });
          }}
        >
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t("outcome")}</legend>
            <div className="flex flex-wrap gap-x-5">
              {(["DONE", "NO_SHOW"] as const).map((o) => (
                <label key={o} className="inline-flex min-h-11 items-center gap-2 text-sm">
                  <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="h-[18px] w-[18px] accent-[var(--primary)]" />
                  {t(o)}
                </label>
              ))}
            </div>
          </fieldset>
          {outcome === "DONE" ? (
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm font-semibold">{t("scorecard")}</legend>
              {SCORE_KEYS.map((k) => (
                <div key={k} className="flex flex-wrap items-center justify-between gap-2">
                  <span id={`sc-${id}-${k}`} className="text-sm">
                    {tc(`score.${k}`)}
                  </span>
                  <div role="radiogroup" aria-labelledby={`sc-${id}-${k}`} className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={scores[k] === n}
                        onClick={() => setScores((s) => ({ ...s, [k]: n }))}
                        className={`tabular h-11 w-11 rounded-[10px] border-[1.5px] text-sm font-semibold ${scores[k] === n ? "border-primary bg-primary text-primary-foreground" : "border-border-strong hover:bg-surface-muted"}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {fieldErrors.scores ? (
                <p role="alert" className="text-[13px] font-medium text-danger">
                  {fieldErrors.scores}
                </p>
              ) : null}
            </fieldset>
          ) : null}
          <Field id={`fb-${id}`} label={t("feedback")} hint={outcome === "DONE" ? t("feedbackHint") : undefined} error={fieldErrors.feedback}>
            <Textarea id={`fb-${id}`} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={5000} className="min-h-24" />
          </Field>
          <Field id={`nt-${id}`} label={t("notes")} hint={t("notesHint")} error={fieldErrors.notes}>
            <Textarea id={`nt-${id}`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} className="min-h-20" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Cancel an open slot or a scheduled session (booked students are told). */
export function CancelSessionDialog({ id, studentName }: { id: string; studentName: string | null }) {
  const t = useTranslations("coach.sessions.cancel");
  const tc = useTranslations("coach.common");
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(cancelSessionAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`${t("button")}${studentName ? `: ${studentName}` : ""}`}>
          <X className="h-4 w-4" aria-hidden="true" />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("title")} description={studentName ? t("bodyBooked", { name: studentName }) : t("bodyOpen")}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(id, reason.trim());
          }}
        >
          {studentName ? (
            <Field id={`cr-${id}`} label={t("reason")} error={fieldErrors.reason}>
              <Textarea id={`cr-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-20" />
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("close")}
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              {t("confirm")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
