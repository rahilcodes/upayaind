"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Ban, ExternalLink } from "lucide-react";
import { normalizeJobUrl } from "@/lib/url-normalize";
import { Field, Input, Select, Textarea, Checkbox, fieldA11y } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { checkDuplicatesAction } from "./actions";
import type { DuplicateState, JobState } from "./types";

export const JD_MIN = 200;
export const JD_MAX = 20_000;
const SOURCES = ["LINKEDIN", "INDEED", "COMPANY_SITE", "DICE", "GLASSDOOR", "ZIPRECRUITER", "HANDSHAKE", "REFERRAL", "OTHER"] as const;
const MODES = ["ONSITE", "HYBRID", "REMOTE"] as const;
const TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "TEMPORARY"] as const;

/** Duplicate check state, re-run on URL/company/title blur (F4). */
export function useDuplicateCheck(studentId: string) {
  const [dup, setDup] = React.useState<DuplicateState | null>(null);
  const [checking, setChecking] = React.useState(false);
  const last = React.useRef("");
  const seq = React.useRef(0);
  const run = React.useCallback(
    async (job: Pick<JobState, "jobUrl" | "companyName" | "jobTitle">, force = false) => {
      const key = `${job.jobUrl}|${job.companyName}|${job.jobTitle}`;
      if (!force && key === last.current) return;
      last.current = key;
      if (!job.jobUrl.trim() && !job.companyName.trim()) {
        setDup(null);
        return;
      }
      const n = ++seq.current;
      setChecking(true);
      const r = await checkDuplicatesAction({ studentId, jobUrl: job.jobUrl || undefined, companyName: job.companyName || undefined, jobTitle: job.jobTitle || undefined });
      if (n !== seq.current) return;
      setChecking(false);
      if (r.ok) setDup(r.data as DuplicateState);
    },
    [studentId],
  );
  const reset = React.useCallback(() => {
    last.current = "";
    setDup(null);
  }, []);
  return { dup, checking, run, reset };
}

export function DuplicateNotice({ dup, confirmed, onConfirm, idPrefix }: { dup: DuplicateState | null; confirmed: boolean; onConfirm: (v: boolean) => void; idPrefix: string }) {
  const t = useTranslations("workspace.duplicates");
  if (!dup) return null;
  if (dup.block) {
    return (
      <div role="alert" className="flex gap-3 rounded-[12px] border border-danger/30 bg-[#FCEAE8] px-4 py-3 text-[14px] text-[#A82A21]">
        <Ban className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-bold">{dup.block.code === "same_url" ? t("blockedUrl") : t("blockedAvoid")}</p>
          <p className="mt-0.5">{dup.block.message}</p>
        </div>
      </div>
    );
  }
  if (!dup.warnings.length) return null;
  return (
    <div role="status" className="rounded-[12px] border border-warning/40 bg-[#FDF3E1] px-4 py-3 text-[14px] text-[#7A4E0E]">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-bold">{t("similarTitle")}</p>
          <ul className="mt-1 space-y-0.5">
            {dup.warnings.map((w) => (
              <li key={w.applicationId}>
                {w.message} <span className="tabular opacity-80">({t("match", { pct: Math.round(w.similarity * 100) })})</span>
              </li>
            ))}
          </ul>
          <label htmlFor={`${idPrefix}-confirm`} className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 font-semibold">
            <Checkbox id={`${idPrefix}-confirm`} checked={confirmed} onChange={(e) => onConfirm(e.target.checked)} />
            {t("confirmSimilar")}
          </label>
        </div>
      </div>
    </div>
  );
}

export function JobForm({
  job,
  onChange,
  onBlurCheck,
  companies,
  disabled,
  compact,
  idPrefix = "job",
  showJd = true,
  errors = {},
}: {
  job: JobState;
  onChange: (patch: Partial<JobState>) => void;
  onBlurCheck: (job: JobState) => void;
  companies: string[];
  disabled?: boolean;
  compact?: boolean;
  idPrefix?: string;
  showJd?: boolean;
  errors?: Record<string, string | undefined>;
}) {
  const t = useTranslations("workspace.job");
  const tm = useTranslations("workMode");
  const te = useTranslations("employmentType");
  const ts = useTranslations("jobSource");
  const id = (k: string) => `${idPrefix}-${k}`;
  const jdLen = job.jd.trim().length;
  const jdState = jdLen === 0 ? "empty" : jdLen < JD_MIN ? "short" : jdLen > JD_MAX ? "long" : "ok";

  let urlValid = true;
  try {
    if (job.jobUrl) new URL(/^https?:\/\//i.test(job.jobUrl) ? job.jobUrl : `https://${job.jobUrl}`);
  } catch {
    urlValid = false;
  }

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-4 disabled:opacity-60">
      <legend className="sr-only">{t("legend")}</legend>
      <Field id={id("jobUrl")} label={t("url")} error={errors.jobUrl ?? (!urlValid ? t("urlInvalid") : undefined)} hint={t("urlHint")}
        labelAside={
          job.jobUrl && urlValid ? (
            <a href={/^https?:\/\//i.test(job.jobUrl) ? job.jobUrl : `https://${job.jobUrl}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
              {t("openJob")}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null
        }
      >
        <Input
          {...fieldA11y(id("jobUrl"), errors.jobUrl, true)}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://www.linkedin.com/jobs/view/…"
          value={job.jobUrl}
          onChange={(e) => onChange({ jobUrl: e.target.value })}
          onBlur={() => {
            const v = job.jobUrl.trim();
            const n = v ? normalizeJobUrl(v) : "";
            const next = { ...job, jobUrl: n };
            if (n !== job.jobUrl) onChange({ jobUrl: n });
            onBlurCheck(next);
          }}
          required
        />
      </Field>
      <div className={cn("grid gap-4", compact ? "sm:grid-cols-2" : "sm:grid-cols-2")}>
        <Field id={id("companyName")} label={t("company")} error={errors.companyName}>
          <Input {...fieldA11y(id("companyName"), errors.companyName)} list={id("companies")} autoComplete="off" value={job.companyName} onChange={(e) => onChange({ companyName: e.target.value })} onBlur={() => onBlurCheck(job)} required maxLength={200} />
          <datalist id={id("companies")}>
            {companies.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field id={id("jobTitle")} label={t("title")} error={errors.jobTitle}>
          <Input {...fieldA11y(id("jobTitle"), errors.jobTitle)} autoComplete="off" value={job.jobTitle} onChange={(e) => onChange({ jobTitle: e.target.value })} onBlur={() => onBlurCheck(job)} required maxLength={200} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id("location")} label={t("location")}>
          <Input {...fieldA11y(id("location"))} autoComplete="off" placeholder={t("locationPlaceholder")} value={job.location} onChange={(e) => onChange({ location: e.target.value })} maxLength={200} />
        </Field>
        <Field id={id("source")} label={t("source")}>
          <Select {...fieldA11y(id("source"))} value={job.source} onChange={(e) => onChange({ source: e.target.value as JobState["source"] })}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={id("workMode")} label={t("workMode")}>
          <Select {...fieldA11y(id("workMode"))} value={job.workMode} onChange={(e) => onChange({ workMode: e.target.value as JobState["workMode"] })}>
            <option value="">{t("notSpecified")}</option>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {tm(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={id("employmentType")} label={t("employmentType")}>
          <Select {...fieldA11y(id("employmentType"))} value={job.employmentType} onChange={(e) => onChange({ employmentType: e.target.value as JobState["employmentType"] })}>
            <option value="">{t("notSpecified")}</option>
            {TYPES.map((m) => (
              <option key={m} value={m}>
                {te(m)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {showJd ? (
        <Field
          id={id("jd")}
          label={t("jd")}
          error={errors.jd ?? (jdState === "long" ? t("jdTooLong", { max: JD_MAX.toLocaleString("en-US") }) : undefined)}
          hint={jdState === "short" ? t("jdTooShort", { min: JD_MIN }) : t("jdHint")}
          labelAside={
            <span className={cn("text-[13px] font-semibold tabular", jdState === "ok" ? "text-success" : jdState === "empty" ? "text-muted-foreground" : "text-warning")} aria-live="polite">
              {t("jdCount", { n: jdLen.toLocaleString("en-US"), max: JD_MAX.toLocaleString("en-US") })}
            </span>
          }
        >
          <Textarea {...fieldA11y(id("jd"), errors.jd, true)} value={job.jd} onChange={(e) => onChange({ jd: e.target.value })} placeholder={t("jdPlaceholder")} className="min-h-[220px] text-[14px]" required />
        </Field>
      ) : null}
    </fieldset>
  );
}
