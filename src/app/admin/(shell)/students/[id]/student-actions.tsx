"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, Pause, Play, RotateCcw, Trash2, Wand2, X } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { ReassignDialog, type EmployeeOption } from "@/components/admin/reassign-dialog";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/input";
import { assignCoachAction, autoAssignStudentAction, confirmDeletionAction, dismissDeletionAction, pauseSubscriptionAction, reassignStudentAction, restoreStudentAction, resumeSubscriptionAction, saveNotesAction, startViewAsAction } from "../actions";

export type CoachOption = { id: string; name: string; code: string; coachees: number };

/** Interview coach card (D-140): pick an active COACH, assign / change / unassign. */
export function CoachAssign({ studentId, currentCoachId, currentCoachName, options }: { studentId: string; currentCoachId: string | null; currentCoachName: string | null; options: CoachOption[] }) {
  const t = useTranslations("admin.student360.coach");
  const [picked, setPicked] = React.useState(currentCoachId ?? "");
  const { run, pending } = useServerAction(assignCoachAction);
  const unassign = React.useCallback(() => assignCoachAction(studentId, null), [studentId]);
  const selected = options.find((o) => o.id === picked);
  return (
    <div className="grid gap-4">
      <p className="text-sm">
        <span className="text-muted-foreground">{t("current")}: </span>
        <span className="font-semibold">{currentCoachName ?? t("none")}</span>
      </p>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noCoaches")}</p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!picked || picked === currentCoachId) return;
            run(studentId, picked);
          }}
        >
          <Field id="coach-pick" label={t("pick")} className="min-w-[220px] flex-1" hint={selected ? t("load", { count: selected.coachees }) : undefined}>
            <Select id="coach-pick" value={picked} onChange={(e) => setPicked(e.target.value)}>
              <option value="">{t("pickNone")}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} · {o.code}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" size="sm" loading={pending} disabled={!picked || picked === currentCoachId} className="h-11">
            {currentCoachId ? t("change") : t("assign")}
          </Button>
          {currentCoachId ? (
            <ConfirmAction trigger={<><X className="h-4 w-4" aria-hidden="true" />{t("unassign")}</>} title={t("unassignTitle")} description={t("unassignBody", { name: currentCoachName ?? "" })} confirmLabel={t("unassign")} action={unassign} />
          ) : null}
        </form>
      )}
    </div>
  );
}

export function StudentReassign({ studentId, studentName, currentEmployeeId, options, isAdmin, canViewAs }: { studentId: string; studentName: string; currentEmployeeId: string | null; options: EmployeeOption[]; isAdmin: boolean; canViewAs?: boolean }) {
  const t = useTranslations("admin.reassign");
  const tv = useTranslations("admin.viewAs");
  const action = React.useCallback((employeeId: string, reason: string, over: boolean) => reassignStudentAction(studentId, employeeId, reason, over), [studentId]);
  const auto = useServerAction(autoAssignStudentAction);
  const [viewPending, startView] = React.useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {isAdmin && canViewAs ? (
        <Button variant="outline" size="sm" loading={viewPending} onClick={() => startView(() => startViewAsAction(studentId))} aria-label={tv("buttonFor", { name: studentName })}>
          <Eye className="h-4 w-4" aria-hidden="true" />
          {tv("button")}
        </Button>
      ) : null}
      {!currentEmployeeId ? (
        <Button size="sm" onClick={() => auto.run(studentId)} loading={auto.pending}>
          <Wand2 className="h-4 w-4" aria-hidden="true" />
          {t("auto")}
        </Button>
      ) : null}
      <ReassignDialog studentName={studentName} currentEmployeeId={currentEmployeeId} options={options} isAdmin={isAdmin} action={action} />
    </div>
  );
}

export function NotesEditor({ studentId, initial }: { studentId: string; initial: string }) {
  const t = useTranslations("admin.student360");
  const [value, setValue] = React.useState(initial);
  const { run, pending } = useServerAction(saveNotesAction);
  const dirty = value !== initial;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(studentId, value);
      }}
      className="grid gap-3"
    >
      <label htmlFor="internal-notes" className="sr-only">
        {t("notesTitle")}
      </label>
      <Textarea id="internal-notes" value={value} onChange={(e) => setValue(e.target.value)} maxLength={10000} placeholder={t("notesPlaceholder")} className="min-h-32" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">{t("notesHint")}</p>
        <Button type="submit" size="sm" loading={pending} disabled={!dirty}>
          {t("notesSave")}
        </Button>
      </div>
    </form>
  );
}

export function DeletionControls({ studentId, state }: { studentId: string; state: "requested" | "deleted" | "none" }) {
  const t = useTranslations("admin.student360");
  const confirm = React.useCallback((note: string) => confirmDeletionAction(studentId, note), [studentId]);
  const dismiss = React.useCallback((note: string) => dismissDeletionAction(studentId, note), [studentId]);
  const restore = React.useCallback(() => restoreStudentAction(studentId), [studentId]);
  if (state === "deleted") {
    return <ConfirmAction trigger={<><RotateCcw className="h-4 w-4" aria-hidden="true" />{t("restore")}</>} title={t("restoreTitle")} description={t("restoreBody")} confirmLabel={t("restore")} confirmVariant="primary" action={restore} />;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmAction
        trigger={<><Trash2 className="h-4 w-4" aria-hidden="true" />{t("confirmDeletion")}</>}
        triggerVariant="danger"
        title={t("confirmDeletionTitle")}
        description={t("confirmDeletionBody")}
        confirmLabel={t("confirmDeletion")}
        reasonLabel={t("deletionNote")}
        reasonHint={t("deletionNoteHint")}
        action={confirm}
      />
      {state === "requested" ? (
        <ConfirmAction
          trigger={<><X className="h-4 w-4" aria-hidden="true" />{t("dismissRequest")}</>}
          title={t("dismissTitle")}
          description={t("dismissBody")}
          confirmLabel={t("dismissRequest")}
          confirmVariant="primary"
          reasonLabel={t("deletionNote")}
          action={dismiss}
        />
      ) : null}
    </div>
  );
}

/** ADMIN only: pause / resume the live subscription (SPEC F11, D-121). */
export function PauseControls({ subscriptionId, status, pausedSince }: { subscriptionId: string; status: string; pausedSince: string | null }) {
  const t = useTranslations("admin.pause");
  const pause = React.useCallback((reason: string) => pauseSubscriptionAction(subscriptionId, reason), [subscriptionId]);
  const resume = React.useCallback(() => resumeSubscriptionAction(subscriptionId), [subscriptionId]);
  if (status === "PAUSED") {
    return (
      <ConfirmAction
        trigger={<><Play className="h-4 w-4" aria-hidden="true" />{t("resume")}</>}
        title={t("resumeTitle")}
        description={pausedSince ? t("resumeBody", { since: pausedSince }) : t("resumeBodyShort")}
        confirmLabel={t("resume")}
        confirmVariant="primary"
        action={resume}
      />
    );
  }
  if (status !== "ACTIVE") return null;
  return (
    <ConfirmAction
      trigger={<><Pause className="h-4 w-4" aria-hidden="true" />{t("pause")}</>}
      title={t("pauseTitle")}
      description={t("pauseBody")}
      confirmLabel={t("pause")}
      confirmVariant="primary"
      reasonLabel={t("reason")}
      reasonHint={t("reasonHint")}
      action={pause}
    />
  );
}
