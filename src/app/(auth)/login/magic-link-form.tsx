"use client";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { magicLinkRequestAction, type FormState } from "../actions";
import { Field, Input, fieldA11y } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormAlert } from "@/components/auth/auth-shell";

/** Students only: "Email me a login link" (D-111). Progressive disclosure keeps the password form primary. */
export function MagicLinkForm({ next }: { next?: string }) {
  const t = useTranslations("auth.magic");
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(magicLinkRequestAction, {});

  if (!open) {
    return (
      <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => setOpen(true)} aria-expanded={false} aria-controls="magic-link">
        <Mail className="h-4 w-4" aria-hidden="true" />
        {t("cta")}
      </Button>
    );
  }
  if (state.ok) {
    return (
      <div id="magic-link">
        <FormAlert tone="success">{t("sent", { email: state.values?.email ?? "" })}</FormAlert>
      </div>
    );
  }
  return (
    <form id="magic-link" action={action} className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface-muted p-4" noValidate>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field id="magic-email" label={t("email")} error={state.fieldErrors?.email}>
        <Input {...fieldA11y("magic-email", state.fieldErrors?.email)} name="email" type="email" autoComplete="username" inputMode="email" required defaultValue={state.values?.email} placeholder="you@example.com" />
      </Field>
      <SubmitButton size="lg" className="w-full">
        {t("send")}
      </SubmitButton>
    </form>
  );
}
