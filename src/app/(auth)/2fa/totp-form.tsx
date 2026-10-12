"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { logoutAction, verifyTotpAction, type FormState } from "../actions";
import { Field, Input, fieldA11y } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormAlert } from "@/components/auth/auth-shell";

export function TotpForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState<FormState, FormData>(verifyTotpAction, {});
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
      <form action={logoutAction}>
        <SubmitButton variant="ghost" className="w-full text-primary">
          {t("useDifferentAccount")}
        </SubmitButton>
      </form>
    </div>
  );
}
