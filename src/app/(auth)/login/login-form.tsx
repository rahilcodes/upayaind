"use client";
import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { loginAction, type FormState } from "../actions";
import { Field, Input, fieldA11y } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormAlert } from "@/components/auth/auth-shell";

export function LoginForm({ next, team, initialError }: { next?: string; team?: boolean; initialError?: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  const errorCode = state.errorCode ?? initialError;
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {errorCode ? (
        <FormAlert>{t.has(`errors.${errorCode}`) ? t(`errors.${errorCode}` as "errors.generic") : t("errors.generic")}</FormAlert>
      ) : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field id="email" label={team ? t("workEmail") : t("email")} error={state.fieldErrors?.email}>
        <Input
          {...fieldA11y("email", state.fieldErrors?.email)}
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          defaultValue={state.values?.email}
          placeholder={team ? "name@upayaind.com" : "you@example.com"}
        />
      </Field>
      <Field
        id="password"
        label={t("password")}
        error={state.fieldErrors?.password}
        labelAside={
          <Link href="/forgot-password" className="text-sm font-semibold text-primary hover:underline">
            {t("forgotPassword")}
          </Link>
        }
      >
        <PasswordInput
          {...fieldA11y("password", state.fieldErrors?.password)}
          autoComplete="current-password"
          required
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
        />
      </Field>
      <SubmitButton size="lg" className="w-full">
        {team ? t("signIn") : t("logIn")}
      </SubmitButton>
    </form>
  );
}
