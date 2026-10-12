"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowRightLeft } from "lucide-react";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { adminUpdateStatusAction } from "./actions";

const ALL: ApplicationStatus[] = ["APPLIED", "VIEWED", "RECRUITER_REPLIED", "ASSESSMENT", "INTERVIEW_SCHEDULED", "INTERVIEWING", "OFFER", "HIRED", "REJECTED", "NO_RESPONSE", "WITHDRAWN", "ON_HOLD"];
const ROUNDS = ["Recruiter screen", "Technical", "Hiring manager", "Panel", "HR", "Final", "Other"] as const;
const MODES = ["Phone", "Video", "Onsite"] as const;

/**
 * Manager/admin status change. Allowed moves (F5 matrix) are listed first;
 * anything else is an override that needs a note (D-031).
 */
export function AdminStatusDialog({ applicationId, label, status, allowed, timezone }: { applicationId: string; label: string; status: ApplicationStatus; allowed: ApplicationStatus[]; timezone: string }) {
  const t = useTranslations("admin.applications.change");
  const ts = useTranslations("status");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [to, setTo] = React.useState<ApplicationStatus | "">("");
  const [note, setNote] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(adminUpdateStatusAction, { onSuccess: () => setOpen(false) });
  const others = ALL.filter((s) => s !== status && !allowed.includes(s));
  const force = Boolean(to) && !allowed.includes(to as ApplicationStatus);
  const needsInterview = to === "INTERVIEW_SCHEDULED";
  const id = React.useId().replace(/:/g, "");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!to) return;
    const fd = new FormData(e.currentTarget);
    const interview = needsInterview
      ? {
          scheduledAt: String(fd.get("when") ?? "") ? new Date(String(fd.get("when"))).toISOString() : "",
          timezone,
          round: String(fd.get("round")) as (typeof ROUNDS)[number],
          mode: String(fd.get("mode")) as (typeof MODES)[number],
          meetingLink: String(fd.get("link") ?? ""),
        }
      : null;
    run(applicationId, to, note.trim(), force, interview as never);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setTo("");
          setNote("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t("open", { label })}>
          <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("title")} description={t("description", { label, status: ts(status) })}>
        <form className="grid gap-4" onSubmit={submit} noValidate>
          <Field id={`to-${id}`} label={t("newStatus")} error={fieldErrors.to}>
            <Select {...fieldA11y(`to-${id}`, fieldErrors.to)} value={to} onChange={(e) => setTo(e.target.value as ApplicationStatus)} required>
              <option value="" disabled>
                {t("pick")}
              </option>
              {allowed.length ? (
                <optgroup label={t("allowed")}>
                  {allowed.map((s) => (
                    <option key={s} value={s}>
                      {ts(s)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {others.length ? (
                <optgroup label={t("override")}>
                  {others.map((s) => (
                    <option key={s} value={s}>
                      {ts(s)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </Select>
          </Field>
          {force ? (
            <p role="status" className="rounded-[12px] border border-[#F2D9A6] bg-[#FDF3E1] px-4 py-3 text-sm text-[#7A4E0E]">
              {t("overrideHint")}
            </p>
          ) : null}
          {needsInterview ? (
            <fieldset className="grid gap-3 rounded-[14px] border border-border p-4 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold">{t("interview")}</legend>
              <Field id={`when-${id}`} label={t("when", { tz: timezone })} error={fieldErrors["interview.scheduledAt"] ?? fieldErrors.interview} className="sm:col-span-2">
                <Input {...fieldA11y(`when-${id}`, fieldErrors.interview)} name="when" type="datetime-local" required />
              </Field>
              <Field id={`round-${id}`} label={t("round")}>
                <Select id={`round-${id}`} name="round" defaultValue="Recruiter screen">
                  {ROUNDS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id={`mode-${id}`} label={t("mode")}>
                <Select id={`mode-${id}`} name="mode" defaultValue="Video">
                  {MODES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id={`link-${id}`} label={t("link")} className="sm:col-span-2" error={fieldErrors["interview.meetingLink"]}>
                <Input id={`link-${id}`} name="link" type="url" placeholder="https://" />
              </Field>
            </fieldset>
          ) : null}
          <Field id={`note-${id}`} label={force ? t("noteRequired") : t("note")} error={fieldErrors.note}>
            <Textarea {...fieldA11y(`note-${id}`, fieldErrors.note)} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className="min-h-20" required={force} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending} disabled={!to || (force && note.trim().length < 3)}>
              {force ? t("submitOverride") : t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
