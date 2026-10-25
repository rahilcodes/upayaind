"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
import { useServerAction } from "@/components/portal/action-form";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, fieldA11y } from "@/components/ui/input";
import type { ActionResult } from "@/server/errors";

/**
 * "Set password" for a student or staff account (D-153). The admin types the
 * password once; it is hashed server-side and never emailed — the team shares
 * it with the person directly. Strings come from `admin.setPassword`.
 */
export function SetPasswordDialog({ action, name, triggerVariant = "outline" }: { action: (input: { password: string; signOutOthers: boolean }) => Promise<ActionResult<unknown>>; name: string; triggerVariant?: "outline" | "ghost" }) {
  const t = useTranslations("admin.setPassword");
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [signOutOthers, setSignOutOthers] = React.useState(true);
  const { run, pending, fieldErrors } = useServerAction(action, { onSuccess: () => { setOpen(false); setPassword(""); } });
  const err = fieldErrors.password;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm" aria-label={t("triggerFor", { name })}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("title", { name })} description={t("description")}>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run({ password, signOutOthers });
          }}
        >
          <Field id="set-pw" label={t("password")} hint={t("passwordHint")} error={err}>
            <PasswordInput {...fieldA11y("set-pw", err)} name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} required showLabel={t("show")} hideLabel={t("hide")} />
          </Field>
          <label className="inline-flex min-h-11 items-center gap-2 text-sm">
            <Checkbox checked={signOutOthers} onChange={(e) => setSignOutOthers(e.target.checked)} />
            {t("signOutOthers")}
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
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
