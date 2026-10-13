"use client";
import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { magicLinkLoginAction, type FormState } from "../../actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormAlert } from "@/components/auth/auth-shell";

export function MagicLoginForm({ token, next }: { token: string; next?: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState<FormState, FormData>(magicLinkLoginAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.errorCode ? (
        <FormAlert>{t.has(`magic.errors.${state.errorCode}`) ? t(`magic.errors.${state.errorCode}` as "magic.errors.invalid") : t("errors.generic")}</FormAlert>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="next" value={next ?? ""} />
      <SubmitButton size="lg" className="w-full">
        {t("magic.continue")}
      </SubmitButton>
      <Link href="/login" className="text-center text-sm font-semibold text-primary hover:underline">
        {t("magic.usePassword")}
      </Link>
    </form>
  );
}
