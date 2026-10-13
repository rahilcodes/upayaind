"use client";
import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { logoutAction, verifyBackupCodeAction, verifyTotpAction, type TotpState } from "../actions";
import { Field, Input, fieldA11y } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormAlert } from "@/components/auth/auth-shell";
import { BackupCodesPanel } from "@/components/auth/backup-codes";

export function TotpForm({ allowBackup }: { allowBackup: boolean }) {
  const t = useTranslations("auth");
  const tb = useTranslations("work.twofa");
  const [mode, setMode] = React.useState<"totp" | "backup">("totp");
  const [state, action] = useActionState<TotpState, FormData>(verifyTotpAction, {});
  const [bState, bAction] = useActionState<TotpState, FormData>(verifyBackupCodeAction, {});

  if (state.ok && state.backupCodes) {
    return <BackupCodesPanel codes={state.backupCodes} continueHref={state.next ?? "/work"} />;
  }

  if (mode === "backup") {
    return (
      <div className="flex flex-col gap-4">
        <form action={bAction} className="flex flex-col gap-5" noValidate>
          {bState.error ? <FormAlert>{bState.error}</FormAlert> : null}
          <Field id="backupCode" label={tb("codeLabel")} hint={tb("codeHint")} error={bState.fieldErrors?.backupCode}>
            <Input
              {...fieldA11y("backupCode", bState.fieldErrors?.backupCode, true)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={12}
              placeholder="xxxx-xxxx"
              autoFocus
              className="h-14 text-center font-mono text-[22px] tracking-[0.2em]"
            />
          </Field>
          <SubmitButton size="lg" className="w-full">
            {t("verifyContinue")}
          </SubmitButton>
        </form>
        <button type="button" onClick={() => setMode("totp")} className="min-h-11 w-full rounded-[12px] text-sm font-semibold text-primary hover:underline">
          {tb("useApp")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-5" noValidate>
        {state.error ? <FormAlert>{state.error}</FormAlert> : null}
        <Field id="code" label={t("verificationCode")} error={state.fieldErrors?.code}>
          <Input
            {...fieldA11y("code", state.fieldErrors?.code)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            placeholder="000000"
            autoFocus
            className="h-14 text-center text-[26px] tracking-[0.4em] tabular"
          />
        </Field>
        <SubmitButton size="lg" className="w-full">
          {t("verifyContinue")}
        </SubmitButton>
      </form>
      {allowBackup ? (
        <button type="button" onClick={() => setMode("backup")} className="min-h-11 w-full rounded-[12px] text-sm font-semibold text-primary hover:underline">
          {tb("useBackup")}
        </button>
      ) : null}
      <form action={logoutAction}>
        <SubmitButton variant="ghost" className="w-full text-primary">
          {t("useDifferentAccount")}
        </SubmitButton>
      </form>
    </div>
  );
}
