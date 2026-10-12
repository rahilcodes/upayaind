"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { CalendarCheck, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useServerAction } from "@/components/portal/action-form";
import { reportOutcomeAction } from "@/app/app/(shell)/applications/[id]/actions";

const ROUNDS = ["Recruiter screen", "Technical", "Hiring manager", "Panel", "HR", "Final", "Other"] as const;
const MODES = ["Phone", "Video", "Onsite"] as const;

/** Student self-report: "I got an interview / offer" (SPEC F5). */
export function ReportOutcome({ applicationId, timezone, canInterview, canOffer }: { applicationId: string; timezone: string; canInterview: boolean; canOffer: boolean }) {
  const t = useTranslations("student.report");
  const tr = useTranslations("student.rows");
  const [open, setOpen] = React.useState<null | "interview" | "offer">(null);
  const [f, setF] = React.useState({ date: "", time: "", round: "Recruiter screen", mode: "Video", meetingLink: "", interviewers: "", note: "" });
  const { run, pending, fieldErrors } = useServerAction(reportOutcomeAction, { onSuccess: () => setOpen(null) });
  if (!canInterview && !canOffer) return null;
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  return (
    <div className="flex flex-wrap gap-2">
      {canInterview ? (
        <Button type="button" variant="success" onClick={() => setOpen("interview")}>
          <CalendarCheck className="h-4 w-4" aria-hidden="true" />
          {t("gotInterview")}
        </Button>
      ) : null}
      {canOffer ? (
        <Button type="button" variant="outline" onClick={() => setOpen("offer")}>
          <PartyPopper className="h-4 w-4" aria-hidden="true" />
          {t("gotOffer")}
        </Button>
      ) : null}
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent title={open === "offer" ? t("offerTitle") : t("interviewTitle")} description={open === "offer" ? t("offerDescription") : t("interviewDescription")}>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run({
                applicationId,
                kind: open!,
                note: f.note || null,
                interview: open === "interview" ? { date: f.date, time: f.time, timezone, round: f.round, mode: f.mode, meetingLink: f.meetingLink || null, interviewers: f.interviewers || null } : null,
              });
            }}
          >
            {open === "interview" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="ri-date" label={t("date")}>
                    <Input id="ri-date" type="date" required value={f.date} onChange={(e) => set({ date: e.target.value })} />
                  </Field>
                  <Field id="ri-time" label={t("time")} hint={t("timeHint")}>
                    <Input id="ri-time" type="time" required value={f.time} onChange={(e) => set({ time: e.target.value })} aria-describedby="ri-time-hint" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="ri-round" label={t("round")}>
                    <Select id="ri-round" value={f.round} onChange={(e) => set({ round: e.target.value })}>
                      {ROUNDS.map((r) => (
                        <option key={r} value={r}>
                          {tr(`round.${r.replace(/\s+/g, "_") as "Technical"}`)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="ri-mode" label={t("mode")}>
                    <Select id="ri-mode" value={f.mode} onChange={(e) => set({ mode: e.target.value })}>
                      {MODES.map((m) => (
                        <option key={m} value={m}>
                          {tr(`mode.${m}`)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field id="ri-link" label={t("link")} hint={t("optional")} error={fieldErrors["interview"]?.[0]}>
                  <Input id="ri-link" type="url" inputMode="url" placeholder="https://" value={f.meetingLink} onChange={(e) => set({ meetingLink: e.target.value })} />
                </Field>
                <Field id="ri-people" label={t("interviewers")} hint={t("optional")}>
                  <Input id="ri-people" value={f.interviewers} onChange={(e) => set({ interviewers: e.target.value })} />
                </Field>
              </>
            ) : null}
            <Field id="ri-note" label={t("note")} hint={t("optional")}>
              <Textarea id="ri-note" rows={3} maxLength={2000} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder={open === "offer" ? t("offerNotePh") : t("notePh")} />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" loading={pending} variant={open === "offer" ? "success" : "primary"}>
                {t("send")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
