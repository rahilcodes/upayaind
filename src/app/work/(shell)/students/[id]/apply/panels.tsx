"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Circle, ClipboardCopy, Loader2, ShieldAlert, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { AtsBreakdown } from "@/server/ai/ats-score";
import type { ValidationResult } from "@/server/ai/validators";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GEN_STEPS, type GenStep } from "./types";
import { useServerAction } from "@/components/portal/action-form";
import { Input } from "@/components/ui/input";
import { confirmSkillAction } from "./actions";

/** "Base 54 → Tailored 86" with breakdown tooltip (§9.5). */
export function ScoreChip({ base, tailored }: { base: AtsBreakdown | null; tailored: AtsBreakdown | null }) {
  const t = useTranslations("workspace.score");
  if (!tailored) return null;
  const tone = tailored.score >= 75 ? "text-success" : tailored.score >= 55 ? "text-warning" : "text-danger";
  const row = (label: string, v: number, w: number) => (
    <div className="flex items-center justify-between gap-6">
      <span>
        {label} <span className="opacity-60">×{w}</span>
      </span>
      <span className="font-semibold tabular">{v}</span>
    </div>
  );
  const content = (
    <div className="min-w-[220px] space-y-1">
      <p className="mb-1 font-bold">{t("breakdown")}</p>
      {row(t("keywords"), tailored.keywordCoverage, 0.5)}
      {row(t("title"), tailored.titleSimilarity, 0.2)}
      {row(t("skills"), tailored.skillsOverlap, 0.2)}
      {row(t("format"), tailored.formatChecks, 0.1)}
      <ul className="mt-1.5 space-y-0.5 border-t border-white/15 pt-1.5 text-[12px]">
        {(["headings", "noTablesOrImages", "length", "contact"] as const).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            {tailored.format[k] ? <Check className="h-3.5 w-3.5 text-[#7EE2B0]" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5 text-[#F5A09A]" aria-hidden="true" />}
            {t(`check.${k}`)}
          </li>
        ))}
      </ul>
      <p className="pt-1 text-[12px] opacity-75">{t("disclaimer")}</p>
    </div>
  );
  return (
    <Tooltip content={content}>
      <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-[14px] font-semibold shadow-sm focus-visible:outline-2" aria-label={t("aria", { base: base?.score ?? 0, tailored: tailored.score })}>
        <span className="text-muted-foreground">{t("base")}</span>
        <span className="tabular">{base?.score ?? "–"}</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">{t("tailored")}</span>
        <span className={cn("text-[17px] font-bold tabular", tone)}>{tailored.score}</span>
      </button>
    </Tooltip>
  );
}

/** "Add as confirmed skill" (D-154): the specialist records how the student confirmed it; the profile is updated and the student notified. */
function ConfirmSkill({ studentId, skill, onDone }: { studentId: string; skill: string; onDone: () => void }) {
  const t = useTranslations("workspace.keywords");
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(confirmSkillAction, { onSuccess: () => { setOpen(false); setNote(""); onDone(); } });
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="ml-1 rounded-full border border-[#E3C98F] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#7A4E0E] hover:bg-[#FBEBC8]" aria-label={t("confirmFor", { skill })}>
        {t("confirm")}
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex w-full flex-wrap items-center gap-2 rounded-[10px] border border-[#E3C98F] bg-white p-2"
      onSubmit={(e) => {
        e.preventDefault();
        run({ studentId, skill, note });
      }}
    >
      <span className="text-[12.5px] font-semibold">{t("confirmTitle", { skill })}</span>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("confirmNotePlaceholder")} aria-label={t("confirmNote")} className="h-9 min-w-[220px] flex-1 text-[13px]" aria-invalid={Boolean(fieldErrors.note)} />
      <Button type="submit" size="sm" loading={pending}>{t("confirmSave")}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{t("confirmCancel")}</Button>
      {fieldErrors.note ? <p role="alert" className="w-full text-[12px] text-danger">{fieldErrors.note[0]}</p> : null}
    </form>
  );
}

/** JD keywords covered ✅ / missing ⚠️ — missing ones are suggestions only (never auto-inserted). */
export function KeywordPanel({ ats, profileSkills, studentId, onProfileChanged }: { ats: AtsBreakdown | null; profileSkills: string[]; studentId?: string; onProfileChanged?: () => void }) {
  const t = useTranslations("workspace.keywords");
  if (!ats) return null;
  const has = new Set(profileSkills.map((s) => s.toLowerCase()));
  const covered = ats.keywords.filter((k) => k.covered);
  const missing = ats.keywords.filter((k) => !k.covered);
  const kindLabel = (k: string) => (k === "required" ? t("required") : k === "nice" ? t("nice") : null);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[15px] font-bold">{t("title")}</h3>
        <span className="text-[13px] text-muted-foreground tabular">{t("summary", { covered: covered.length, total: ats.keywords.length })}</span>
      </div>
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t("covered")}
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {covered.map((k) => (
            <li key={k.keyword} className="inline-flex items-center gap-1 rounded-full bg-[#E6F4EC] px-2.5 py-1 text-[13px] font-medium text-[#1E7B4F]">
              <span aria-hidden="true">✅</span> {k.keyword}
              {kindLabel(k.kind) ? <span className="text-[11px] opacity-70">· {kindLabel(k.kind)}</span> : null}
            </li>
          ))}
          {!covered.length ? <li className="text-[13px] text-muted-foreground">{t("none")}</li> : null}
        </ul>
      </div>
      {missing.length ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-[#7A4E0E]">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {t("missing")}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {missing.map((k) => (
              <li key={k.keyword} className="inline-flex flex-wrap items-center gap-1 rounded-full bg-[#FDF3E1] px-2.5 py-1 text-[13px] font-medium text-[#7A4E0E]" title={has.has(k.keyword.toLowerCase()) ? t("inProfile") : t("notInProfile")}>
                <span aria-hidden="true">⚠️</span> {k.keyword}
                {k.partial ? <span className="text-[11px] opacity-70">· {t("partial", { pct: Math.round(k.partial * 100) })}</span> : null}
                {has.has(k.keyword.toLowerCase()) ? <span className="text-[11px] font-semibold">· {t("inProfileShort")}</span> : null}
                {studentId && !has.has(k.keyword.toLowerCase()) && k.kind !== "keyword" ? <ConfirmSkill studentId={studentId} skill={k.keyword} onDone={() => onProfileChanged?.()} /> : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">{t("missingHint")}</p>
        </div>
      ) : null}
    </div>
  );
}

/** Truthfulness status + structured diff (expected vs actual) of every error. */
export function ValidationPanel({ result, attempts, aiUnavailable }: { result: ValidationResult | null; attempts?: number; aiUnavailable?: boolean }) {
  const t = useTranslations("workspace.validation");
  if (!result) return null;
  if (result.ok) {
    return (
      <div className="flex items-start gap-3 rounded-[12px] border border-success/25 bg-[#E6F4EC] px-4 py-3 text-[14px] text-[#17633f]" role="status">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-bold">{t("passed")}</p>
          <p className="text-[13px]">{aiUnavailable ? t("passedBase") : attempts && attempts > 1 ? t("passedRetry") : t("passedBody")}</p>
          {result.warnings.length ? (
            <ul className="mt-1.5 space-y-0.5 text-[13px] text-[#7A4E0E]">
              {result.warnings.map((w, i) => (
                <li key={i} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {w.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-[12px] border border-danger/30 bg-[#FCEAE8] px-4 py-3 text-[14px] text-[#A82A21]" role="alert">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-bold">{t("failed", { n: result.errors.length })}</p>
          <p className="text-[13px]">{t("failedBody")}</p>
        </div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {result.errors.map((e, i) => (
          <li key={i} className="rounded-[8px] bg-white/70 px-3 py-2 text-[13px] text-foreground">
            <p className="font-semibold text-[#A82A21]">{e.message}</p>
            {e.expected || e.actual ? (
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 font-mono text-[12px]">
                {e.expected ? (
                  <>
                    <dt className="text-success">− {t("profile")}</dt>
                    <dd className="break-words">{e.expected}</dd>
                  </>
                ) : null}
                {e.actual ? (
                  <>
                    <dt className="text-danger">+ {t("resume")}</dt>
                    <dd className="break-words">{e.actual}</dd>
                  </>
                ) : null}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GenerationProgress({ step, error }: { step: GenStep | null; error?: string | null }) {
  const t = useTranslations("workspace.steps");
  const idx = step === "done" ? GEN_STEPS.length : step ? GEN_STEPS.indexOf(step) : -1;
  return (
    <div className="rounded-[16px] border border-border bg-surface p-4" aria-live="polite">
      <ol className="flex flex-col gap-2.5">
        {GEN_STEPS.map((s, i) => {
          const state = i < idx ? "done" : i === idx ? (error ? "error" : "active") : "todo";
          return (
            <li key={s} className={cn("flex items-center gap-3 text-[14px]", state === "todo" && "text-muted-foreground")}>
              {state === "done" ? (
                <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
              ) : state === "active" ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              ) : state === "error" ? (
                <XCircle className="h-5 w-5 text-danger" aria-hidden="true" />
              ) : (
                <Circle className="h-5 w-5 text-border-strong" aria-hidden="true" />
              )}
              <span className={cn(state === "active" && "font-semibold")}>{t(s)}</span>
              <span className="sr-only">{t(`state.${state}`)}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-track">
        <div className="brand-gradient h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(4, (Math.max(0, idx) / GEN_STEPS.length) * 100)}%` }} />
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[14px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function CoverLetterPanel({
  value,
  onChange,
  onGenerate,
  generating,
  aiEnabled,
  locked,
  saving,
}: {
  value: string;
  onChange: (v: string) => void;
  onGenerate: () => void;
  generating: boolean;
  aiEnabled: boolean;
  locked: boolean;
  saving: boolean;
}) {
  const t = useTranslations("workspace.cover");
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold">{t("title")}</h3>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onGenerate} loading={generating} disabled={!aiEnabled || locked} title={!aiEnabled ? t("aiOff") : undefined}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {value ? t("regenerate") : t("generate")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!value}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                toast.success(t("copied"));
              } catch {
                toast.error(t("copyFailed"));
              }
            }}
          >
            <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
            {t("copy")}
          </Button>
        </div>
      </div>
      <Textarea aria-label={t("title")} value={value} onChange={(e) => onChange(e.target.value)} disabled={locked} placeholder={aiEnabled ? t("placeholder") : t("placeholderManual")} className="min-h-[220px] text-[14px]" />
      <div className="flex justify-between text-[12.5px]">
        <span className="text-muted-foreground">{saving ? t("saving") : t("rules")}</span>
        <span className={cn("font-semibold tabular", words > 250 ? "text-danger" : "text-muted-foreground")}>{t("words", { n: words })}</span>
      </div>
    </div>
  );
}
