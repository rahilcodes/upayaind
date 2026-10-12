"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, FileUp, Globe, AtSign, Code2, Loader2, Mail, PartyPopper, PencilLine, RefreshCcw, Sparkles, UploadCloud } from "lucide-react";
import type { ResumeData } from "@/resume/schema";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { MasterProfileEditor } from "@/components/student/master-profile-editor";
import { PreferencesForm, toPreferencesInput, type PreferencesValue } from "@/components/student/preferences-form";
import { VaultManager, VaultNotice, type VaultItem } from "@/components/student/vault-manager";
import { ONBOARDING_STEPS } from "@/lib/schemas/student";
import { cn } from "@/lib/utils";
import { resendVerificationAction } from "@/app/(auth)/actions";
import { completeStepAction, finishOnboardingAction, parseStatusAction, saveLinksAction, saveMasterAction, savePreferencesAction, uploadResumeAction } from "./actions";

type Props = {
  title: string;
  paid: boolean;
  subscriptionActive: boolean;
  initialStep: number;
  maxStep: number;
  firstName: string;
  email: string;
  emailVerified: boolean;
  marketCode: string;
  master: ResumeData | null;
  blankMaster: ResumeData;
  parse: { method: "ai" | "heuristic" | null; warnings: string[] } | null;
  uploadName: string | null;
  preferences: PreferencesValue;
  links: { linkedinUrl: string; githubUrl: string; portfolioUrl: string };
  credentials: VaultItem[];
};

const MAX_BYTES = 5 * 1024 * 1024;

export function OnboardingWizard(p: Props) {
  const t = useTranslations("student.onboarding");
  const router = useRouter();
  const [step, setStep] = React.useState(p.initialStep);
  const [maxStep, setMaxStep] = React.useState(p.maxStep);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const first = React.useRef(true);

  // Keep ?step= in the URL (resumable / shareable), move focus to the new step heading.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(step + 1));
    window.history.replaceState(null, "", url);
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [step]);

  const goTo = (n: number, reached?: number | null) => {
    if (typeof reached === "number") setMaxStep((m) => Math.max(m, Math.min(reached, ONBOARDING_STEPS.length - 1)));
    setStep(n);
  };

  const key = ONBOARDING_STEPS[step]!;
  return (
    <div className="portal flex min-h-dvh flex-col bg-canvas text-foreground">
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        {t("skip")}
      </a>
      <header className="relative overflow-hidden bg-ink text-white">
        <svg aria-hidden="true" viewBox="0 0 760 220" className="pointer-events-none absolute -right-24 -top-6 hidden w-[620px] opacity-25 md:block">
          <defs>
            <linearGradient id="onbg" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#0A35D6" />
              <stop offset="0.5" stopColor="#0A7CF0" />
              <stop offset="1" stopColor="#18B8F2" />
            </linearGradient>
          </defs>
          <path d="M20 210 L260 110 L400 160 L720 20" fill="none" stroke="url(#onbg)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="relative mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 pt-5 sm:px-6">
          <Link href="/" aria-label={t("home")} className="rounded-md">
            <Logo inverted size={30} />
          </Link>
          <Link href="/app/settings" className="rounded-md px-2 py-2 text-sm font-medium text-[#C9D1EC] hover:text-white">
            {t("accountSettings")}
          </Link>
        </div>
        <div className="relative mx-auto w-full max-w-4xl px-4 pb-6 pt-6 sm:px-6 sm:pb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-sky">{t("eyebrow", { n: step + 1, total: ONBOARDING_STEPS.length })}</p>
          <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-[-0.01em] sm:text-[32px]">{step === 0 ? t("welcome", { name: p.firstName }) : p.title}</h1>
          <Stepper step={step} maxStep={maxStep} onPick={(n) => setStep(n)} />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
        <div className="grid gap-3">
          {p.paid ? (
            <Banner tone="success" icon={<PartyPopper className="h-5 w-5" aria-hidden="true" />}>
              <p className="font-semibold">{t("paidTitle")}</p>
              <p>{p.subscriptionActive ? t("paidBodyActive") : t("paidBodyPending")}</p>
            </Banner>
          ) : null}
          {!p.paid && !p.subscriptionActive ? (
            <Banner tone="info" icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}>
              <p>
                {t("noPlanBody")}{" "}
                <Link href="/app/billing" className="font-semibold underline underline-offset-2">
                  {t("noPlanLink")}
                </Link>
              </p>
            </Banner>
          ) : null}
          {!p.emailVerified ? <VerifyBanner email={p.email} /> : null}
        </div>

        <section aria-labelledby="step-heading" className="mt-6">
          <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-[22px] font-bold outline-none">
            {t(`steps.${key}.title`)}
          </h2>
          <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">{t(`steps.${key}.intro`)}</p>
          <div className="mt-6">
            {key === "resume" ? <ResumeStep {...p} onNext={(reached) => goTo(1, reached)} /> : null}
            {key === "preferences" ? <PreferencesStep initial={p.preferences} marketCode={p.marketCode} onBack={() => setStep(0)} onNext={(reached) => goTo(2, reached)} /> : null}
            {key === "vault" ? <VaultStep items={p.credentials} onBack={() => setStep(1)} onNext={(reached) => goTo(3, reached)} /> : null}
            {key === "links" ? <LinksStep initial={p.links} onBack={() => setStep(2)} onNext={(reached) => goTo(4, reached)} /> : null}
            {key === "review" ? (
              <ReviewStep
                {...p}
                onBack={() => setStep(3)}
                onEdit={(n) => setStep(n)}
                onDone={() => {
                  // Full navigation so the refreshed session cookie is used by middleware.
                  router.refresh();
                  window.location.assign("/app?welcome=1");
                }}
              />
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

function Stepper({ step, maxStep, onPick }: { step: number; maxStep: number; onPick: (n: number) => void }) {
  const t = useTranslations("student.onboarding");
  return (
    <nav aria-label={t("progress")} className="mt-5">
      <ol className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {ONBOARDING_STEPS.map((k, i) => {
          const done = i < step || i < maxStep;
          const current = i === step;
          const reachable = i <= maxStep;
          return (
            <li key={k} className="min-w-0">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onPick(i)}
                aria-current={current ? "step" : undefined}
                className="group flex w-full min-w-0 flex-col gap-2 rounded-[8px] py-1 text-left disabled:cursor-default"
              >
                <span className={cn("h-1.5 w-full rounded-full", current || done ? "brand-gradient" : "bg-white/15")} />
                <span className={cn("flex items-center gap-1.5 truncate text-xs font-semibold sm:text-[13px]", current ? "text-white" : reachable ? "text-[#C9D1EC] group-hover:text-white" : "text-[#7F8BB5]")}>
                  {done && !current ? <Check className="h-3.5 w-3.5 shrink-0 text-sky" aria-hidden="true" /> : null}
                  <span className="hidden truncate sm:inline">{t(`steps.${k}.short`)}</span>
                  <span className="sm:hidden">{i + 1}</span>
                  <span className="sr-only">
                    {" "}
                    {t(`steps.${k}.short`)}
                    {done && !current ? `, ${t("completed")}` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Banner({ tone, icon, children }: { tone: "success" | "info" | "warning"; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = { success: "border-[#BFE3CF] bg-[#E6F4EC] text-[#155C3A]", info: "border-[#C9D7FB] bg-[#EEF2FD] text-[#0A2BA8]", warning: "border-[#F0D9AE] bg-[#FDF3E1] text-[#5E3C08]" }[tone];
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-[14px] border px-4 py-3 text-sm", cls)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="grid gap-0.5">{children}</div>
    </div>
  );
}

function VerifyBanner({ email }: { email: string }) {
  const t = useTranslations("student.onboarding");
  const [pending, start] = React.useTransition();
  const [sent, setSent] = React.useState(false);
  return (
    <div role="status" className="flex flex-col gap-3 rounded-[14px] border border-[#F0D9AE] bg-[#FDF3E1] px-4 py-3 text-sm text-[#5E3C08] sm:flex-row sm:items-center">
      <Mail className="hidden h-5 w-5 shrink-0 sm:block" aria-hidden="true" />
      <p className="flex-1">{t("verifyBody", { email })}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={pending}
        disabled={sent}
        className="self-start sm:self-auto"
        onClick={() =>
          start(async () => {
            const r = await resendVerificationAction();
            if (r.ok) {
              setSent(true);
              toast.success(t("verifySent"));
            } else if (r.error) toast.error(r.error);
          })
        }
      >
        {sent ? t("verifySent") : t("verifyResend")}
      </Button>
    </div>
  );
}

function StepNav({ onBack, next, nextLabel, pending, secondary }: { onBack?: () => void; next: () => void; nextLabel?: string; pending?: boolean; secondary?: React.ReactNode }) {
  const t = useTranslations("student.onboarding");
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur supports-[padding:max(0px)]:pb-[max(0px,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-4 py-3 sm:px-6">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("back")}
          </Button>
        ) : null}
        <div className="flex-1" />
        {secondary}
        <Button type="button" onClick={next} loading={pending} className="min-w-[140px]">
          {nextLabel ?? t("saveContinue")}
          {!pending ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────── Step 1: resume ───────────────────────────

type ParseUi = { phase: "upload" } | { phase: "parsing"; fileId: string; name: string } | { phase: "review"; method: "ai" | "heuristic" | null; warnings: string[] };

function ResumeStep(p: Props & { onNext: (reached: number | null) => void }) {
  const t = useTranslations("student.onboarding.resume");
  const [ui, setUi] = React.useState<ParseUi>(p.master ? { phase: "review", method: p.parse?.method ?? null, warnings: p.parse?.warnings ?? [] } : { phase: "upload" });
  const [draft, setDraft] = React.useState<ResumeData>(p.master ?? p.blankMaster);
  const [uploading, startUpload] = React.useTransition();
  const [saving, startSave] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function upload(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) return setError(t("tooLarge"));
    if (!/\.(pdf|docx)$/i.test(file.name)) return setError(t("wrongType"));
    startUpload(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const r = await uploadResumeAction(fd);
      if (!r.ok) return setError(r.error);
      setUi({ phase: "parsing", fileId: r.data.fileId, name: file.name });
    });
  }

  // Poll the parse job.
  React.useEffect(() => {
    if (ui.phase !== "parsing") return;
    let stop = false;
    let tries = 0;
    const tick = async () => {
      if (stop) return;
      tries++;
      const r = await parseStatusAction(ui.fileId);
      if (stop) return;
      if (!r.ok) {
        setError(r.error);
        setUi({ phase: "upload" });
        return;
      }
      if (r.data.done) {
        if (r.data.master) setDraft(r.data.master);
        setUi({ phase: "review", method: r.data.method, warnings: r.data.warnings });
        toast.success(t("parsedToast"));
        return;
      }
      if (tries > 90) {
        setError(t("parseSlow"));
        setUi({ phase: "upload" });
        return;
      }
      window.setTimeout(tick, tries < 10 ? 1500 : 3000);
    };
    const id = window.setTimeout(tick, 1200);
    return () => {
      stop = true;
      window.clearTimeout(id);
    };
  }, [ui, t]);

  const save = (advance: boolean) =>
    startSave(async () => {
      const r = await saveMasterAction(draft, { advance });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("saved"));
      setDirty(false);
      if (advance) p.onNext(r.data.step);
    });

  if (ui.phase === "upload") {
    return (
      <div className="grid gap-4 [&>*]:min-w-0">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) upload(f);
          }}
          className={cn("flex flex-col items-center gap-4 rounded-[20px] border-2 border-dashed bg-surface px-6 py-10 text-center transition-colors sm:py-14", drag ? "border-primary bg-accent/40" : "border-border-strong")}
        >
          <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-accent text-accent-foreground">
            {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
          </span>
          <div>
            <p className="text-lg font-bold">{uploading ? t("uploading") : t("dropTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("dropHint")}</p>
          </div>
          <input
            ref={inputRef}
            id="resume-file"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
            aria-describedby={error ? "resume-file-error" : undefined}
          />
          <Button type="button" size="lg" loading={uploading} onClick={() => inputRef.current?.click()}>
            <FileUp className="h-5 w-5" aria-hidden="true" />
            {t("choose")}
          </Button>
          {error ? (
            <p id="resume-file-error" role="alert" className="max-w-md text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-surface px-4 py-3 text-sm">
          <p className="text-muted-foreground">{t("noResume")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setUi({ phase: "review", method: null, warnings: [] })}>
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            {t("manual")}
          </Button>
        </div>
        {p.master ? (
          <Button type="button" variant="ghost" className="justify-self-start" onClick={() => setUi({ phase: "review", method: p.parse?.method ?? null, warnings: p.parse?.warnings ?? [] })}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("backToProfile")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (ui.phase === "parsing") {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-5 rounded-[20px] border border-border bg-surface px-6 py-12 text-center">
        <div className="relative h-20 w-20" aria-hidden="true">
          <span className="absolute inset-0 animate-ping rounded-full bg-sky/25 motion-reduce:animate-none" />
          <span className="relative flex h-20 w-20 items-center justify-center rounded-full brand-gradient text-white">
            <Sparkles className="h-8 w-8" />
          </span>
        </div>
        <div>
          <p className="text-lg font-bold">{t("parsingTitle")}</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{t("parsingBody", { name: ui.name })}</p>
        </div>
        <ul className="grid gap-2 text-left text-sm text-muted-foreground">
          {(["parsing1", "parsing2", "parsing3"] as const).map((k) => (
            <li key={k} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              {t(k)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <div className="flex flex-col gap-3 rounded-[16px] border border-border bg-surface p-4 sm:flex-row sm:items-center">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#E6F4EC] text-success">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{ui.method ? t("reviewTitle") : t("manualTitle")}</p>
          <p className="text-muted-foreground">{ui.method === "heuristic" ? t("reviewHeuristic") : ui.method === "ai" ? t("reviewAi") : t("manualBody")}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setUi({ phase: "upload" })}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          {p.uploadName || ui.method ? t("reupload") : t("upload")}
        </Button>
      </div>
      {ui.warnings.length ? (
        <div className="rounded-[14px] border border-[#F0D9AE] bg-[#FDF3E1] px-4 py-3 text-sm text-[#5E3C08]">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {t("checkThese")}
          </p>
          <ul className="mt-1 list-disc pl-6">
            {ui.warnings.slice(0, 6).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <MasterProfileEditor
        value={draft}
        onChange={(v) => {
          setDraft(v);
          setDirty(true);
        }}
        idPrefix="onb"
      />
      <StepNav
        next={() => save(true)}
        pending={saving}
        secondary={
          dirty ? (
            <Button type="button" variant="outline" className="hidden sm:inline-flex" loading={saving} onClick={() => save(false)}>
              {t("saveDraft")}
            </Button>
          ) : null
        }
      />
    </div>
  );
}

// ─────────────────────────── Step 2: preferences ───────────────────────────

function PreferencesStep({ initial, marketCode, onBack, onNext }: { initial: PreferencesValue; marketCode: string; onBack: () => void; onNext: (reached: number | null) => void }) {
  const [v, setV] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  return (
    <div className="rounded-[20px] border border-border bg-surface p-4 sm:p-6">
      <PreferencesForm value={v} onChange={setV} marketCode={marketCode} errors={errors} />
      <StepNav
        onBack={onBack}
        pending={pending}
        next={() =>
          start(async () => {
            const r = await savePreferencesAction(toPreferencesInput(v), { advance: true });
            if (!r.ok) {
              setErrors(r.fieldErrors ?? {});
              toast.error(r.error);
              return;
            }
            setErrors({});
            onNext(r.data.step);
          })
        }
      />
    </div>
  );
}

// ─────────────────────────── Step 3: vault ───────────────────────────

function VaultStep({ items, onBack, onNext }: { items: VaultItem[]; onBack: () => void; onNext: (reached: number | null) => void }) {
  const t = useTranslations("student.onboarding.vault");
  const [pending, start] = React.useTransition();
  const next = () =>
    start(async () => {
      const r = await completeStepAction("vault");
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      onNext(r.data.step);
    });
  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <VaultNotice />
      <VaultManager items={items} compact />
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{t("skipHint")}</p> : null}
      <StepNav onBack={onBack} next={next} pending={pending} nextLabel={items.length ? undefined : t("skipForNow")} />
    </div>
  );
}

// ─────────────────────────── Step 4: links ───────────────────────────

function LinksStep({ initial, onBack, onNext }: { initial: Props["links"]; onBack: () => void; onNext: (reached: number | null) => void }) {
  const t = useTranslations("student.onboarding.links");
  const [v, setV] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const rows = [
    { k: "linkedinUrl", icon: <AtSign className="h-5 w-5" aria-hidden="true" />, ph: "linkedin.com/in/your-name" },
    { k: "githubUrl", icon: <Code2 className="h-5 w-5" aria-hidden="true" />, ph: "github.com/your-name" },
    { k: "portfolioUrl", icon: <Globe className="h-5 w-5" aria-hidden="true" />, ph: "yourname.dev" },
  ] as const;
  return (
    <div className="grid gap-5 rounded-[20px] border border-border bg-surface p-4 sm:p-6">
      {rows.map((r) => (
        <Field key={r.k} id={r.k} label={t(r.k)} hint={t(`${r.k}Hint`)} error={errors[r.k]?.[0]}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">{r.icon}</span>
            <Input id={r.k} inputMode="url" autoComplete="url" placeholder={r.ph} value={v[r.k]} onChange={(e) => setV({ ...v, [r.k]: e.target.value })} className="pl-11" aria-invalid={Boolean(errors[r.k]) || undefined} aria-describedby={errors[r.k] ? `${r.k}-error` : `${r.k}-hint`} />
          </div>
        </Field>
      ))}
      <StepNav
        onBack={onBack}
        pending={pending}
        next={() =>
          start(async () => {
            const r = await saveLinksAction(v, { advance: true });
            if (!r.ok) {
              setErrors(r.fieldErrors ?? {});
              toast.error(r.error);
              return;
            }
            setErrors({});
            onNext(r.data.step);
          })
        }
      />
    </div>
  );
}

// ─────────────────────────── Step 5: review & consent ───────────────────────────

function ReviewStep(p: Props & { onBack: () => void; onEdit: (n: number) => void; onDone: () => void }) {
  const t = useTranslations("student.onboarding.review");
  const [consent, setConsent] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  if (done) {
    return (
      <div role="status" className="relative overflow-hidden rounded-[20px] bg-ink px-6 py-12 text-center text-white">
        <div aria-hidden="true" className="brand-gradient absolute inset-x-0 top-0 h-1.5" />
        <CheckCircle2 className="mx-auto h-14 w-14 text-sky" aria-hidden="true" />
        <p className="mt-4 text-2xl font-bold">{t("doneTitle")}</p>
        <p className="mx-auto mt-2 max-w-md text-[#C9D1EC]">{t("doneBody")}</p>
        <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-[#C9D1EC]" aria-hidden="true" />
      </div>
    );
  }

  const items = [
    { n: 0, label: t("resume"), ok: Boolean(p.master), detail: p.master ? t("resumeOk") : t("resumeMissing") },
    { n: 1, label: t("preferences"), ok: p.preferences.targetTitles.length > 0 && p.preferences.workModes.length > 0 && Boolean(p.preferences.workAuthorization), detail: p.preferences.targetTitles.join(", ") || t("missing") },
    { n: 2, label: t("vault"), ok: true, detail: t("vaultCount", { count: p.credentials.length }) },
    { n: 3, label: t("links"), ok: true, detail: [p.links.linkedinUrl && "LinkedIn", p.links.githubUrl && "GitHub", p.links.portfolioUrl && t("portfolio")].filter(Boolean).join(" · ") || t("noLinks") },
  ];

  return (
    <div className="grid gap-5">
      <ul className="grid gap-2.5">
        {items.map((i) => (
          <li key={i.n} className="flex items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3">
            <span aria-hidden="true" className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", i.ok ? "bg-[#E6F4EC] text-success" : "bg-[#FDF3E1] text-warning")}>
              {i.ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{i.label}</p>
              <p className="truncate text-sm text-muted-foreground">{i.detail}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => p.onEdit(i.n)} aria-label={t("editX", { what: i.label })}>
              {t("edit")}
            </Button>
          </li>
        ))}
      </ul>
      <div className={cn("rounded-[14px] border px-4 py-3 text-sm", p.emailVerified ? "border-[#BFE3CF] bg-[#E6F4EC] text-[#155C3A]" : "border-[#F0D9AE] bg-[#FDF3E1] text-[#5E3C08]")}>
        <p className="flex items-center gap-2 font-semibold">
          <Mail className="h-4 w-4" aria-hidden="true" />
          {p.emailVerified ? t("emailOk") : t("emailMissing")}
        </p>
        {!p.emailVerified ? <p className="mt-1">{t("emailMissingBody")}</p> : null}
      </div>
      <div className="rounded-[18px] border border-border bg-surface p-4 sm:p-5">
        <h3 className="text-base font-bold">{t("consentTitle")}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("consent1")}</li>
          <li>{t("consent2")}</li>
          <li>{t("consent3")}</li>
        </ul>
        <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-[12px] bg-accent/50 p-3 text-[15px] font-medium">
          <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" aria-describedby={error ? "consent-error" : undefined} />
          <span>{t("consentLabel")}</span>
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          {t.rich("consentLegal", {
            terms: (c) => (
              <Link href="/legal/terms" className="underline underline-offset-2" target="_blank">
                {c}
              </Link>
            ),
            privacy: (c) => (
              <Link href="/legal/privacy" className="underline underline-offset-2" target="_blank">
                {c}
              </Link>
            ),
          })}
        </p>
        {error ? (
          <p id="consent-error" role="alert" className="mt-3 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <StepNav
        onBack={p.onBack}
        pending={pending}
        nextLabel={t("finish")}
        next={() =>
          start(async () => {
            setError(null);
            if (!consent) {
              setError(t("consentRequired"));
              return;
            }
            const r = await finishOnboardingAction(consent);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setDone(true);
            window.setTimeout(p.onDone, 1400);
          })
        }
      />
      {!p.emailVerified ? <VerifyBanner email={p.email} /> : null}
    </div>
  );
}
