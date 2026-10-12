"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signupAction, completeProfileAction, type FormState } from "../actions";
import { Checkbox, Field, Input, Select, fieldA11y } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormAlert } from "@/components/auth/auth-shell";

type Market = { code: string; name: string };

function useTimezone() {
  const [tz, setTz] = useState("");
  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {}
  }, []);
  return tz;
}

function Consents({ state }: { state: FormState }) {
  const t = useTranslations("auth");
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">Consents</legend>
      <label className="flex min-h-11 items-start gap-3 text-sm text-muted-foreground">
        <Checkbox name="consentTerms" defaultChecked={state.values?.consentTerms === "on"} className="mt-0.5" aria-invalid={Boolean(state.fieldErrors?.consentTerms) || undefined} />
        <span>
          {t.rich("consentTerms", {
            terms: (c) => (
              <Link href="/legal/terms" target="_blank" className="font-semibold text-primary underline-offset-2 hover:underline">
                {c}
              </Link>
            ),
            privacy: (c) => (
              <Link href="/legal/privacy" target="_blank" className="font-semibold text-primary underline-offset-2 hover:underline">
                {c}
              </Link>
            ),
          })}
        </span>
      </label>
      {state.fieldErrors?.consentTerms ? <p role="alert" className="-mt-1 text-[13px] font-medium text-danger">{state.fieldErrors.consentTerms[0]}</p> : null}
      <label className="flex min-h-11 items-start gap-3 text-sm text-muted-foreground">
        <Checkbox name="consentApply" defaultChecked={state.values?.consentApply === "on"} className="mt-0.5" aria-invalid={Boolean(state.fieldErrors?.consentApply) || undefined} />
        <span>{t("consentApply")}</span>
      </label>
      {state.fieldErrors?.consentApply ? <p role="alert" className="-mt-1 text-[13px] font-medium text-danger">{state.fieldErrors.consentApply[0]}</p> : null}
    </fieldset>
  );
}

function MarketSelect({ markets, defaultMarket, state }: { markets: Market[]; defaultMarket: string; state: FormState }) {
  const t = useTranslations("auth");
  return (
    <Field id="market" label={t("country")} error={state.fieldErrors?.market}>
      <Select {...fieldA11y("market", state.fieldErrors?.market)} defaultValue={state.values?.market || defaultMarket} autoComplete="country">
        {markets.map((m) => (
          <option key={m.code} value={m.code}>
            {m.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function SignupForm({ markets, defaultMarket, plan }: { markets: Market[]; defaultMarket: string; plan?: string }) {
  const t = useTranslations("auth");
  const tz = useTimezone();
  const [state, action] = useActionState<FormState, FormData>(signupAction, {});
  const fe = state.fieldErrors;
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <input type="hidden" name="plan" value={plan ?? ""} />
      <input type="hidden" name="timezone" value={tz} />
      <Field id="name" label={t("fullName")} error={fe?.name}>
        <Input {...fieldA11y("name", fe?.name)} autoComplete="name" required defaultValue={state.values?.name} />
      </Field>
      <Field id="email" label={t("email")} error={fe?.email}>
        <Input {...fieldA11y("email", fe?.email)} type="email" inputMode="email" autoComplete="email" required defaultValue={state.values?.email} />
      </Field>
      <Field id="password" label={t("password")} hint={t("passwordHint")} error={fe?.password}>
        <PasswordInput {...fieldA11y("password", fe?.password, true)} autoComplete="new-password" required minLength={10} showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <MarketSelect markets={markets} defaultMarket={defaultMarket} state={state} />
        <Field id="phone" label={t("phone")} error={fe?.phone}>
          <Input {...fieldA11y("phone", fe?.phone)} type="tel" inputMode="tel" autoComplete="tel" required placeholder="+1 415 555 0123" defaultValue={state.values?.phone} />
        </Field>
      </div>
      <Consents state={state} />
      <SubmitButton size="lg" className="w-full">
        {t("createAndContinue")}
      </SubmitButton>
    </form>
  );
}

export function CompleteProfileForm({ markets, defaultMarket, plan }: { markets: Market[]; defaultMarket: string; plan?: string }) {
  const t = useTranslations("auth");
  const tz = useTimezone();
  const [state, action] = useActionState<FormState, FormData>(completeProfileAction, {});
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <input type="hidden" name="plan" value={plan ?? ""} />
      <input type="hidden" name="timezone" value={tz} />
      <MarketSelect markets={markets} defaultMarket={defaultMarket} state={state} />
      <Field id="phone" label={t("phone")} hint={t("phoneHint")} error={state.fieldErrors?.phone}>
        <Input {...fieldA11y("phone", state.fieldErrors?.phone, true)} type="tel" inputMode="tel" autoComplete="tel" required defaultValue={state.values?.phone} />
      </Field>
      <Consents state={state} />
      <SubmitButton size="lg" className="w-full">
        {t("continue")}
      </SubmitButton>
    </form>
  );
}
