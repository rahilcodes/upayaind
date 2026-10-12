"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, fieldA11y } from "@/components/ui/input";
import { useServerAction } from "@/components/portal/action-form";
import { changePasswordAction, updateProfileAction } from "./actions";

export function ProfileForm({ initial, zones }: { initial: { name: string; phone: string; timezone: string }; zones: string[] }) {
  const t = useTranslations("work.profile.form");
  const { run, pending, fieldErrors } = useServerAction(updateProfileAction);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void run({ name: String(fd.get("name") ?? ""), phone: String(fd.get("phone") ?? ""), timezone: String(fd.get("timezone") ?? "") });
      }}
      className="grid gap-4"
      noValidate
    >
      <Field id="p-name" label={t("name")} error={fieldErrors.name}>
        <Input {...fieldA11y("p-name", fieldErrors.name)} defaultValue={initial.name} autoComplete="name" required maxLength={80} />
      </Field>
      <Field id="p-phone" label={t("phone")} error={fieldErrors.phone}>
        <Input {...fieldA11y("p-phone", fieldErrors.phone)} defaultValue={initial.phone} type="tel" autoComplete="tel" maxLength={20} />
      </Field>
      <Field id="p-tz" label={t("timezone")} hint={t("timezoneHint")} error={fieldErrors.timezone}>
        <Select {...fieldA11y("p-tz", fieldErrors.timezone, true)} name="timezone" defaultValue={initial.timezone}>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </Select>
      </Field>
      <div><Button type="submit" loading={pending}>{t("save")}</Button></div>
    </form>
  );
}

export function PasswordForm() {
  const t = useTranslations("work.profile.password");
  const ref = React.useRef<HTMLFormElement>(null);
  const { run, pending, fieldErrors } = useServerAction(changePasswordAction, { onSuccess: () => ref.current?.reset(), refresh: false });
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void run({ current: String(fd.get("current") ?? ""), next: String(fd.get("next") ?? ""), confirm: String(fd.get("confirm") ?? "") });
      }}
      className="grid gap-4"
      noValidate
    >
      <Field id="current" label={t("current")} error={fieldErrors.current}>
        <Input {...fieldA11y("current", fieldErrors.current)} type="password" autoComplete="current-password" required />
      </Field>
      <Field id="next" label={t("next")} hint={t("nextHint")} error={fieldErrors.next}>
        <Input {...fieldA11y("next", fieldErrors.next, true)} type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field id="confirm" label={t("confirm")} error={fieldErrors.confirm}>
        <Input {...fieldA11y("confirm", fieldErrors.confirm)} type="password" autoComplete="new-password" required />
      </Field>
      <div><Button type="submit" loading={pending}>{t("submit")}</Button></div>
    </form>
  );
}
