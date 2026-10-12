"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import type { ResumeData } from "@/resume/schema";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, fieldA11y } from "@/components/ui/input";
import { useServerAction } from "@/components/portal/action-form";
import { MasterProfileEditor } from "@/components/student/master-profile-editor";
import { PreferencesForm, toPreferencesInput, type PreferencesValue } from "@/components/student/preferences-form";
import { saveProfileLinksAction, savePersonalAction, saveProfileMasterAction, saveProfilePreferencesAction } from "./actions";

function SaveBar({ pending, dirty, label }: { pending: boolean; dirty: boolean; label: string }) {
  const t = useTranslations("student.profile");
  return (
    <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
      {dirty ? <span className="text-sm text-muted-foreground" aria-live="polite">{t("unsaved")}</span> : null}
      <Button type="submit" loading={pending}>
        {label}
      </Button>
    </div>
  );
}

export function PersonalForm({ initial, email, timezones }: { initial: { name: string; phone: string; timezone: string }; email: string; timezones: { value: string; label: string }[] }) {
  const t = useTranslations("student.profile");
  const [v, setV] = React.useState(initial);
  const { run, pending, fieldErrors } = useServerAction(savePersonalAction);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(v);
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field id="name" label={t("name")} error={fieldErrors.name}>
          <Input {...fieldA11y("name", fieldErrors.name)} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoComplete="name" required />
        </Field>
        <Field id="email" label={t("email")} hint={t("emailHint")}>
          <Input id="email" value={email} readOnly disabled aria-describedby="email-hint" />
        </Field>
        <Field id="phone" label={t("phone")} error={fieldErrors.phone}>
          <Input {...fieldA11y("phone", fieldErrors.phone)} type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} autoComplete="tel" required />
        </Field>
        <Field id="timezone" label={t("timezone")} hint={t("timezoneHint")} error={fieldErrors.timezone}>
          <Select {...fieldA11y("timezone", fieldErrors.timezone, true)} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>
            {timezones.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <SaveBar pending={pending} dirty={dirty} label={t("save")} />
    </form>
  );
}

export function ProfilePreferencesForm({ initial, marketCode }: { initial: PreferencesValue; marketCode: string }) {
  const t = useTranslations("student.profile");
  const [v, setV] = React.useState(initial);
  const { run, pending, fieldErrors } = useServerAction(saveProfilePreferencesAction);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(toPreferencesInput(v));
      }}
    >
      <PreferencesForm value={v} onChange={setV} marketCode={marketCode} errors={fieldErrors} />
      <SaveBar pending={pending} dirty={JSON.stringify(v) !== JSON.stringify(initial)} label={t("save")} />
    </form>
  );
}

export function LinksForm({ initial }: { initial: { linkedinUrl: string; githubUrl: string; portfolioUrl: string } }) {
  const t = useTranslations("student.profile");
  const tl = useTranslations("student.onboarding.links");
  const [v, setV] = React.useState(initial);
  const { run, pending, fieldErrors } = useServerAction(saveProfileLinksAction);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(v);
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 [&>*]:min-w-0">
        {(["linkedinUrl", "githubUrl", "portfolioUrl"] as const).map((k) => (
          <Field key={k} id={k} label={tl(k)} error={fieldErrors[k]}>
            <Input {...fieldA11y(k, fieldErrors[k])} inputMode="url" placeholder="https://" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <SaveBar pending={pending} dirty={JSON.stringify(v) !== JSON.stringify(initial)} label={t("save")} />
    </form>
  );
}

export function MasterForm({ initial }: { initial: ResumeData }) {
  const t = useTranslations("student.profile");
  const [v, setV] = React.useState(initial);
  const [saved, setSaved] = React.useState(initial);
  const { run, pending } = useServerAction(saveProfileMasterAction, { onSuccess: () => setSaved(v) });
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(v);
      }}
    >
      <p className="mb-4 rounded-[14px] bg-accent/60 px-4 py-3 text-sm text-accent-foreground">{t("masterHint")}</p>
      <MasterProfileEditor value={v} onChange={setV} idPrefix="pf" />
      <div className="sticky bottom-0 z-10 -mx-1 mt-4 flex items-center justify-end gap-3 rounded-[14px] border border-border bg-surface/95 px-4 py-3 backdrop-blur">
        {dirty ? <span className="text-sm text-muted-foreground" aria-live="polite">{t("unsaved")}</span> : <span className="text-sm text-muted-foreground">{t("allSaved")}</span>}
        <Button type="submit" loading={pending} disabled={!dirty}>
          {t("saveMaster")}
        </Button>
      </div>
    </form>
  );
}
