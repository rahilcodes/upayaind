"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/input";
import { EMPLOYMENT_TYPE_VALUES, NOTICE_PERIODS, SENIORITY_LEVELS, US_WORK_AUTH, WORK_MODE_VALUES, type PreferencesInput } from "@/lib/schemas/student";
import { ChoiceChips, SwitchRow, TagInput } from "./tag-input";

export type PreferencesValue = {
  targetTitles: string[];
  seniority: string;
  industries: string[];
  locations: string[];
  remoteOk: boolean;
  workModes: (typeof WORK_MODE_VALUES)[number][];
  employmentTypes: (typeof EMPLOYMENT_TYPE_VALUES)[number][];
  minSalary: number | null | string;
  salaryCurrency: string;
  workAuthorization: string;
  willingToRelocate: boolean;
  noticePeriod: string;
  avoidCompanies: string[];
  targetCompanies: string[];
};

export function toPreferencesInput(v: PreferencesValue): PreferencesInput {
  return { ...v, seniority: v.seniority as PreferencesInput["seniority"], minSalary: v.minSalary === "" ? null : v.minSalary };
}

const INDUSTRY_SUGGESTIONS = ["Fintech", "Banking", "Healthcare", "SaaS", "E-commerce", "Retail", "Consulting", "Logistics", "Insurance", "Education", "Government", "Media", "Manufacturing", "Telecom", "Energy"];
const CURRENCIES = ["USD", "CAD", "GBP", "EUR", "AUD", "INR", "AED"];

/** F3 step 2 — job preferences. Used in onboarding and on /app/profile. */
export function PreferencesForm({ value, onChange, marketCode, errors = {} }: { value: PreferencesValue; onChange: (v: PreferencesValue) => void; marketCode: string; errors?: Record<string, string[] | undefined> }) {
  const t = useTranslations("student.prefs");
  const tm = useTranslations("workMode");
  const te = useTranslations("employmentType");
  const set = (patch: Partial<PreferencesValue>) => onChange({ ...value, ...patch });
  const err = (k: string) => errors[k]?.[0];
  const isUS = marketCode === "US";
  const authOptions = isUS ? US_WORK_AUTH : null;

  return (
    <div className="grid [&>*]:min-w-0 gap-6">
      <Field id="targetTitles" label={t("titles")} hint={t("titlesHint")} error={err("targetTitles")}>
        <TagInput id="targetTitles" value={value.targetTitles} onChange={(targetTitles) => set({ targetTitles })} max={5} placeholder={t("titlesPh")} invalid={Boolean(err("targetTitles"))} describedBy={err("targetTitles") ? "targetTitles-error" : "targetTitles-hint"} />
      </Field>

      <div className="grid [&>*]:min-w-0 gap-6 sm:grid-cols-2">
        <Field id="seniority" label={t("seniority")} error={err("seniority")}>
          <Select id="seniority" value={value.seniority} onChange={(e) => set({ seniority: e.target.value })} aria-invalid={Boolean(err("seniority")) || undefined}>
            <option value="">{t("choose")}</option>
            {SENIORITY_LEVELS.map((s) => (
              <option key={s} value={s}>
                {t(`seniorityLevel.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="workAuthorization" label={t("workAuth")} hint={t("workAuthHint")} error={err("workAuthorization")}>
          {authOptions ? (
            <Select id="workAuthorization" value={value.workAuthorization} onChange={(e) => set({ workAuthorization: e.target.value })} aria-invalid={Boolean(err("workAuthorization")) || undefined} aria-describedby="workAuthorization-hint">
              <option value="">{t("choose")}</option>
              {authOptions.map((a) => (
                <option key={a} value={a}>
                  {t(`auth.${a.replace(/\s+/g, "_")}` as "auth.Citizen")}
                </option>
              ))}
            </Select>
          ) : (
            <Input id="workAuthorization" value={value.workAuthorization} onChange={(e) => set({ workAuthorization: e.target.value })} placeholder={t("workAuthPh")} aria-describedby="workAuthorization-hint" />
          )}
        </Field>
      </div>

      <ChoiceChips name="workModes" legend={t("workModes")} options={WORK_MODE_VALUES} value={value.workModes} onChange={(workModes) => set({ workModes })} labels={(m) => tm(m)} error={err("workModes")} />
      <ChoiceChips name="employmentTypes" legend={t("employmentTypes")} options={EMPLOYMENT_TYPE_VALUES} value={value.employmentTypes} onChange={(employmentTypes) => set({ employmentTypes })} labels={(m) => te(m)} error={err("employmentTypes")} />

      <Field id="locations" label={t("locations")} hint={t("locationsHint")}>
        <TagInput id="locations" value={value.locations} onChange={(locations) => set({ locations })} max={10} placeholder={t("locationsPh")} describedBy="locations-hint" />
      </Field>
      <div className="grid [&>*]:min-w-0 gap-2 rounded-[14px] border border-border bg-canvas/60 px-4 py-3">
        <SwitchRow id="remoteOk" label={t("remoteOk")} hint={t("remoteOkHint")} checked={value.remoteOk} onChange={(remoteOk) => set({ remoteOk })} />
        <SwitchRow id="willingToRelocate" label={t("relocate")} checked={value.willingToRelocate} onChange={(willingToRelocate) => set({ willingToRelocate })} />
      </div>

      <Field id="industries" label={t("industries")} hint={t("industriesHint")}>
        <TagInput id="industries" value={value.industries} onChange={(industries) => set({ industries })} max={10} suggestions={INDUSTRY_SUGGESTIONS} placeholder={t("industriesPh")} describedBy="industries-hint" />
      </Field>

      <div className="grid [&>*]:min-w-0 gap-6 sm:grid-cols-2">
        <Field id="minSalary" label={t("minSalary")} hint={t("minSalaryHint")} error={err("minSalary")}>
          <div className="grid [&>*]:min-w-0 grid-cols-[minmax(0,1fr)_110px] gap-2">
            <Input id="minSalary" inputMode="numeric" value={value.minSalary ?? ""} onChange={(e) => set({ minSalary: e.target.value.replace(/[^\d.]/g, "") })} placeholder="90000" aria-describedby="minSalary-hint" />
            <Select aria-label={t("currency")} value={value.salaryCurrency} onChange={(e) => set({ salaryCurrency: e.target.value })}>
              {[...new Set([value.salaryCurrency, ...CURRENCIES])].filter(Boolean).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </Field>
        <Field id="noticePeriod" label={t("notice")}>
          <Select id="noticePeriod" value={value.noticePeriod} onChange={(e) => set({ noticePeriod: e.target.value })}>
            <option value="">{t("choose")}</option>
            {NOTICE_PERIODS.map((n) => (
              <option key={n} value={n}>
                {t(`noticeOption.${n.replace(/\s+/g, "_")}` as "noticeOption.Immediately")}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid [&>*]:min-w-0 gap-6 sm:grid-cols-2">
        <Field id="targetCompanies" label={t("targetCompanies")} hint={t("targetCompaniesHint")}>
          <TagInput id="targetCompanies" value={value.targetCompanies} onChange={(targetCompanies) => set({ targetCompanies })} max={50} placeholder={t("companyPh")} describedBy="targetCompanies-hint" />
        </Field>
        <Field id="avoidCompanies" label={t("avoidCompanies")} hint={t("avoidCompaniesHint")}>
          <TagInput id="avoidCompanies" value={value.avoidCompanies} onChange={(avoidCompanies) => set({ avoidCompanies })} max={50} placeholder={t("companyPh")} describedBy="avoidCompanies-hint" />
        </Field>
      </div>
    </div>
  );
}
