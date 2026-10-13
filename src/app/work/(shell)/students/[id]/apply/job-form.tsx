"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Ban, Download, ExternalLink, Loader2, Sparkles, X } from "lucide-react";
import { normalizeJobUrl } from "@/lib/url-normalize";
import { Field, Input, Select, Textarea, Checkbox, fieldA11y } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/portal/company-logo";
import { cn } from "@/lib/utils";
import { checkDuplicatesAction, fetchJobUrlAction } from "./actions";
import type { CompanySuggestion, DuplicateState, JobState } from "./types";

export const JD_MIN = 200;
export const JD_MAX = 20_000;
const SOURCES = ["LINKEDIN", "INDEED", "COMPANY_SITE", "DICE", "GLASSDOOR", "ZIPRECRUITER", "HANDSHAKE", "REFERRAL", "OTHER"] as const;
const MODES = ["ONSITE", "HYBRID", "REMOTE"] as const;
const TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "TEMPORARY"] as const;

const withScheme = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

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

/** Fetched-from-page notice (D-100): which fields were filled, or why the fetch failed. */
type FetchNotice = { kind: "ok"; fields: string[] } | { kind: "error"; message: string };

/**
 * Accessible company autocomplete (combobox + listbox) over every company the
 * employee has logged, ranked by frequency; picking one fills the domain too.
 */
function CompanyCombobox({ id, value, domain, suggestions, onChange, onBlur, error }: { id: string; value: string; domain: string; suggestions: CompanySuggestion[]; onChange: (name: string, domain: string) => void; onBlur: () => void; error?: string }) {
  const t = useTranslations("workspace.companies");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const listId = `${id}-list`;
  const q = value.trim().toLowerCase();
  const matches = React.useMemo(() => {
    if (!q) return suggestions.slice(0, 8);
    const starts = suggestions.filter((s) => s.name.toLowerCase().startsWith(q));
    const contains = suggestions.filter((s) => !s.name.toLowerCase().startsWith(q) && s.name.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, 8);
  }, [q, suggestions]);
  const exact = matches.length === 1 && matches[0]!.name.toLowerCase() === q && (matches[0]!.domain ?? "") === domain;
  const show = open && matches.length > 0 && !exact;
  const pick = (s: CompanySuggestion) => {
    onChange(s.name, s.domain ?? "");
    setOpen(false);
    setActive(-1);
  };
  return (
    <div className="relative">
      <Input
        {...fieldA11y(id, error)}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value, "");
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Let a click on an option land first.
          window.setTimeout(() => setOpen(false), 120);
          onBlur();
        }}
        onKeyDown={(e) => {
          if (!show && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
          }
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? matches.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(matches[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
        required
        maxLength={200}
      />
      {domain ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 hidden items-center text-[12px] text-muted-foreground sm:flex" aria-hidden="true">
          {domain}
        </span>
      ) : null}
      <ul id={listId} role="listbox" aria-label={t("listLabel")} className={cn("absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-[12px] border border-border bg-surface p-1 shadow-[0_12px_32px_-12px_rgba(11,24,70,0.35)]", !show && "hidden")}>
        {matches.map((s, i) => (
          <li
            key={`${s.name}|${s.domain ?? ""}`}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 text-[14px]", i === active && "bg-accent")}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(s)}
          >
            <CompanyLogo name={s.name} domain={s.domain} size={22} />
            <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
            {s.domain ? <span className="hidden truncate text-[12px] text-muted-foreground sm:inline">{s.domain}</span> : null}
            <span className="shrink-0 text-[12px] text-muted-foreground tabular">{t("times", { n: s.count })}</span>
          </li>
        ))}
      </ul>
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
  autoFetch = true,
}: {
  job: JobState;
  onChange: (patch: Partial<JobState>) => void;
  onBlurCheck: (job: JobState) => void;
  companies: CompanySuggestion[];
  disabled?: boolean;
  compact?: boolean;
  idPrefix?: string;
  showJd?: boolean;
  errors?: Record<string, string | undefined>;
  /** Fetch the page on URL blur (D-100). The button is always available. */
  autoFetch?: boolean;
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
    if (job.jobUrl) new URL(withScheme(job.jobUrl));
  } catch {
    urlValid = false;
  }

  // ── Job URL → auto-fill ──
  const [fetching, setFetching] = React.useState(false);
  const [notice, setNotice] = React.useState<FetchNotice | null>(null);
  const lastFetched = React.useRef("");
  const jobRef = React.useRef(job);
  jobRef.current = job;
  const fetchSeq = React.useRef(0);

  const fetchPage = React.useCallback(
    async (url: string, opts: { manual?: boolean } = {}) => {
      const u = url.trim();
      if (!u || disabled) return;
      if (!opts.manual && lastFetched.current === u) return;
      lastFetched.current = u;
      const n = ++fetchSeq.current;
      setFetching(true);
      setNotice(null);
      const r = await fetchJobUrlAction(u);
      if (n !== fetchSeq.current) return;
      setFetching(false);
      if (!r.ok) {
        setNotice({ kind: "error", message: r.error });
        return;
      }
      const cur = jobRef.current;
      const patch: Partial<JobState> = {};
      const filled: string[] = [];
      if (!cur.jobTitle.trim() && r.data.title) {
        patch.jobTitle = r.data.title;
        filled.push(t("fetchedField.title"));
      }
      if (!cur.companyName.trim() && r.data.company) {
        patch.companyName = r.data.company;
        patch.companyDomain = "";
        filled.push(t("fetchedField.company"));
      }
      if (!cur.location.trim() && r.data.location) {
        patch.location = r.data.location;
        filled.push(t("fetchedField.location"));
      }
      if (!cur.workMode && r.data.workMode) {
        patch.workMode = r.data.workMode;
        filled.push(t("fetchedField.workMode"));
      }
      if (!cur.employmentType && r.data.employmentType) {
        patch.employmentType = r.data.employmentType;
        filled.push(t("fetchedField.employmentType"));
      }
      if (showJd && !cur.jd.trim() && r.data.description.trim().length >= 50) {
        patch.jd = r.data.description;
        filled.push(t("fetchedField.jd"));
      }
      if (Object.keys(patch).length) {
        onChange(patch);
        onBlurCheck({ ...cur, ...patch });
      }
      setNotice({ kind: "ok", fields: filled });
    },
    [disabled, onBlurCheck, onChange, showJd, t],
  );

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-4 disabled:opacity-60">
      <legend className="sr-only">{t("legend")}</legend>
      <Field
        id={id("jobUrl")}
        label={t("url")}
        error={errors.jobUrl ?? (!urlValid ? t("urlInvalid") : undefined)}
        hint={t("urlHint")}
        labelAside={
          job.jobUrl && urlValid ? (
            <a href={withScheme(job.jobUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
              {t("openJob")}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null
        }
      >
        <div className="flex gap-2">
          <Input
            {...fieldA11y(id("jobUrl"), errors.jobUrl, true)}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://www.linkedin.com/jobs/view/…"
            value={job.jobUrl}
            className="min-w-0 flex-1"
            onChange={(e) => onChange({ jobUrl: e.target.value })}
            onBlur={() => {
              const v = job.jobUrl.trim();
              const n = v ? normalizeJobUrl(v) : "";
              const next = { ...job, jobUrl: n };
              if (n !== job.jobUrl) onChange({ jobUrl: n });
              onBlurCheck(next);
              if (autoFetch && n && urlValid && (showJd ? !job.jd.trim() : !job.companyName.trim() || !job.jobTitle.trim())) void fetchPage(n);
            }}
            required
          />
          <Button type="button" variant="outline" className="shrink-0 px-3" onClick={() => void fetchPage(job.jobUrl, { manual: true })} disabled={!job.jobUrl.trim() || !urlValid || fetching} aria-label={t("fetchAria")} title={t("fetchTitle")}>
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            <span className="hidden sm:inline">{t("fetch")}</span>
          </Button>
        </div>
      </Field>
      {fetching ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("fetching")}
        </p>
      ) : notice ? (
        <div role="status" className={cn("flex items-start gap-2.5 rounded-[12px] border px-3.5 py-2.5 text-[13px]", notice.kind === "ok" ? "border-primary/30 bg-accent/60 text-foreground" : "border-warning/40 bg-[#FDF3E1] text-[#7A4E0E]")}>
          {notice.kind === "ok" ? <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <p className="min-w-0 flex-1">{notice.kind === "ok" ? (notice.fields.length ? t("fetched", { fields: notice.fields.join(", ") }) : t("fetchedNothing")) : t("fetchFailed", { reason: notice.message })}</p>
          <button type="button" className="-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] hover:bg-black/5" onClick={() => setNotice(null)} aria-label={t("dismiss")}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className={cn("grid gap-4", compact ? "sm:grid-cols-2" : "sm:grid-cols-2")}>
        <Field id={id("companyName")} label={t("company")} error={errors.companyName}>
          <CompanyCombobox id={id("companyName")} value={job.companyName} domain={job.companyDomain} suggestions={companies} error={errors.companyName} onChange={(companyName, companyDomain) => onChange({ companyName, companyDomain })} onBlur={() => onBlurCheck(jobRef.current)} />
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
