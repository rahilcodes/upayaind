"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field, Input, fieldA11y } from "@/components/ui/input";
import { useServerAction } from "@/components/portal/action-form";
import { SwitchRow } from "@/components/student/tag-input";
import { cancelDeletionAction, changePasswordAction, requestDeletionAction, saveEmailPrefsAction } from "./actions";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations("student.settings");
  const [v, setV] = React.useState({ current: "", password: "", confirm: "" });
  const [show, setShow] = React.useState(false);
  const { run, pending, fieldErrors } = useServerAction(changePasswordAction, { onSuccess: () => setV({ current: "", password: "", confirm: "" }) });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(v);
      }}
      className="grid max-w-md gap-4"
    >
      {hasPassword ? (
        <Field id="current" label={t("currentPassword")} error={fieldErrors.current}>
          <Input {...fieldA11y("current", fieldErrors.current)} type={show ? "text" : "password"} autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} required />
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noPasswordYet")}</p>
      )}
      <Field id="password" label={t("newPassword")} hint={t("passwordHint")} error={fieldErrors.password}>
        <div className="relative">
          <Input {...fieldA11y("password", fieldErrors.password, true)} type={show ? "text" : "password"} autoComplete="new-password" minLength={10} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} required className="pr-12" />
          <button type="button" onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? t("hidePasswords") : t("showPasswords")} className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-surface-muted">
            {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </Field>
      <Field id="confirm" label={t("confirmPassword")} error={fieldErrors.confirm}>
        <Input {...fieldA11y("confirm", fieldErrors.confirm)} type={show ? "text" : "password"} autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} required />
      </Field>
      <Button type="submit" loading={pending} className="justify-self-start">
        {hasPassword ? t("updatePassword") : t("setPassword")}
      </Button>
    </form>
  );
}

export function EmailPrefsForm({ initial, keys }: { initial: Record<string, boolean>; keys: readonly string[] }) {
  const t = useTranslations("student.settings.emails");
  const ts = useTranslations("student.settings");
  const [v, setV] = React.useState(initial);
  const { run, pending } = useServerAction(saveEmailPrefsAction);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(v);
      }}
    >
      <div className="grid divide-y divide-border">
        {keys.map((k) => (
          <div key={k} className="py-3 first:pt-0">
            <SwitchRow id={`pref-${k}`} label={t(`${k}.label` as "daily_digest.label")} hint={t(`${k}.hint` as "daily_digest.hint")} checked={v[k] ?? true} onChange={(on) => setV({ ...v, [k]: on })} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground">{ts("mandatoryNote")}</p>
      <div className="mt-4 flex justify-end">
        <Button type="submit" loading={pending} disabled={!dirty}>
          {ts("savePrefs")}
        </Button>
      </div>
    </form>
  );
}

export function DeletionPanel({ requestedAt, email }: { requestedAt: string | null; email: string }) {
  const t = useTranslations("student.settings");
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const req = useServerAction(requestDeletionAction, { onSuccess: () => setOpen(false) });
  const cancel = useServerAction(cancelDeletionAction);
  if (requestedAt) {
    return (
      <div role="status" className="grid gap-3 rounded-[14px] border border-[#F3C8C3] bg-[#FCEAE8] p-4 text-sm text-[#8E231B]">
        <p className="font-semibold">{t("deletionPending", { date: requestedAt })}</p>
        <p>{t("deletionPendingBody")}</p>
        <Button type="button" variant="outline" size="sm" className="justify-self-start" loading={cancel.pending} onClick={() => cancel.run()}>
          {t("cancelDeletion")}
        </Button>
      </div>
    );
  }
  return (
    <>
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>
        {t("requestDeletion")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("deleteTitle")} description={t("deleteDescription")}>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              req.run(confirm);
            }}
          >
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{t("delete1")}</li>
              <li>{t("delete2")}</li>
              <li>{t("delete3")}</li>
            </ul>
            <Field id="confirmEmail" label={t("typeEmail", { email })} error={req.fieldErrors.confirmEmail}>
              <Input {...fieldA11y("confirmEmail", req.fieldErrors.confirmEmail)} type="email" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("keepAccount")}
                </Button>
              </DialogClose>
              <Button type="submit" variant="danger" loading={req.pending} disabled={confirm.trim().toLowerCase() !== email.toLowerCase()}>
                {t("confirmDeletion")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
