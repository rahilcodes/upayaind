"use client";
import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { forgotPasswordAction, type FormState } from "../actions";
import { Field, Input, fieldA11y } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormAlert } from "@/components/auth/auth-shell";

export function ForgotForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  if (state.ok) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="success">{t("forgotSent")}</FormAlert>
        <Link href="/login" className="text-center text-sm font-semibold text-primary hover:underline">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <Field id="email" label={t("email")} error={state.fieldErrors?.email}>
        <Input {...fieldA11y("email", state.fieldErrors?.email)} type="email" autoComplete="email" required defaultValue={state.values?.email} />
      </Field>
      <SubmitButton size="lg" className="w-full">
        {t("sendLink")}
      </SubmitButton>
      <Link href="/login" className="text-center text-sm font-semibold text-primary hover:underline">
        {t("backToLogin")}
      </Link>
    </form>
  );
}
