"use client";
import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { acceptInviteAction, resetPasswordAction, type FormState } from "../actions";
import { Field, fieldA11y } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormAlert } from "@/components/auth/auth-shell";

export function SetPasswordForm({ token, mode }: { token: string; mode: "reset" | "invite" }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState<FormState, FormData>(mode === "reset" ? resetPasswordAction : acceptInviteAction, {});
  if (state.ok) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="success">{t("resetDone")}</FormAlert>
        <Link href="/login" className="text-center text-sm font-semibold text-primary hover:underline">
          {t("logIn")}
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <input type="hidden" name="token" value={token} />
      <Field id="password" label={t("newPassword")} hint={t("passwordHint")} error={state.fieldErrors?.password}>
        <PasswordInput {...fieldA11y("password", state.fieldErrors?.password, true)} autoComplete="new-password" required minLength={10} showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
      </Field>
      <Field id="confirm" label={t("confirmPassword")} error={state.fieldErrors?.confirm}>
        <PasswordInput {...fieldA11y("confirm", state.fieldErrors?.confirm)} autoComplete="new-password" required showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
      </Field>
      <SubmitButton size="lg" className="w-full">
        {mode === "reset" ? t("updatePassword") : t("activateAccount")}
      </SubmitButton>
    </form>
  );
}
