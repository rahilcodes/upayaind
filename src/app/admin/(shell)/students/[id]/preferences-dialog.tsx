"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { useServerAction } from "@/components/portal/action-form";
import { PreferencesForm, toPreferencesInput, type PreferencesValue } from "@/components/student/preferences-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { updateStudentPreferencesAction } from "../actions";

/** Same form the student sees on /app/profile, saved through the admin path with an audit row (D-147). */
export function PreferencesEditDialog({ studentId, value, marketCode }: { studentId: string; value: PreferencesValue; marketCode: string }) {
  const t = useTranslations("admin.student360.edit");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(value);
  const { run, pending, fieldErrors } = useServerAction(updateStudentPreferencesAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(value);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {t("preferences")}
        </Button>
      </DialogTrigger>
      <DialogContent wide title={t("preferencesTitle")} description={t("preferencesDescription")}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            run(studentId, toPreferencesInput(v));
          }}
        >
          <PreferencesForm value={v} onChange={setV} marketCode={marketCode} errors={fieldErrors} />
          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {tc("saveChanges")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
