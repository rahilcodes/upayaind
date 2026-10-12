"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, Trash2, Wand2, X } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { ReassignDialog, type EmployeeOption } from "@/components/admin/reassign-dialog";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { autoAssignStudentAction, confirmDeletionAction, dismissDeletionAction, reassignStudentAction, restoreStudentAction, saveNotesAction } from "../actions";

export function StudentReassign({ studentId, studentName, currentEmployeeId, options, isAdmin }: { studentId: string; studentName: string; currentEmployeeId: string | null; options: EmployeeOption[]; isAdmin: boolean }) {
  const t = useTranslations("admin.reassign");
  const action = React.useCallback((employeeId: string, reason: string, over: boolean) => reassignStudentAction(studentId, employeeId, reason, over), [studentId]);
  const auto = useServerAction(autoAssignStudentAction);
  return (
    <div className="flex flex-wrap gap-2">
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
