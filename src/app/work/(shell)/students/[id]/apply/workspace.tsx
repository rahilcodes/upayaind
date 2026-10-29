"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, FileDown, FileText, Keyboard, Loader2, Lock, Pencil, Plus, Sparkles, Upload, Zap } from "lucide-react";
import type { ResumeData } from "@/resume/schema";
import type { RenderStyle } from "@/resume/styles";
import { computeAtsScore, type AtsBreakdown } from "@/server/ai/ats-score";
import { validateTailored, type ValidationResult } from "@/server/ai/validators";
import { StatusPill } from "@/components/portal/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { generateCoverLetterAction, markAppliedAction, saveCoverLetterAction, saveVersionAction, suggestEditAction } from "./actions";
import { DuplicateNotice, JD_MAX, JD_MIN, JobForm, useDuplicateCheck } from "./job-form";
import { CoverLetterPanel, GenerationProgress, KeywordPanel, ScoreChip, ValidationPanel } from "./panels";
import { ResumeEditor, type AiAssist } from "./resume-editor";
import { MarkAppliedDialog, QuickLogDialog } from "./dialogs";
import { usePreview } from "./use-preview";
import { jobWithDefaults, type CompanySuggestion, type GenStep, type JobState, type RecentApp, type SaveState, type StyleInfo, type TailorState, type WorkspaceDefaults } from "./types";

type Props = {
  student: { id: string; name: string; firstName: string; timezone: string; hasMaster: boolean };
  market: { code: string; name: string };
  style: StyleInfo;
  subscription: { active: boolean; status: string | null; planName: string | null; dailyTarget: number };
  today: { applied: number; target: number };
  companies: CompanySuggestion[];
  /** Last-used source / work mode / employment type / location (D-102). */
  defaults: WorkspaceDefaults | null;
  recent: RecentApp[];
  master: ResumeData | null;
  masterIssues: string[];
  profileSkills: string[];
  aiEnabled: boolean;
  employeeTimezone: string;
};

/** ≥ 1024px (Tailwind lg). Server snapshot = desktop (the workspace is desktop-first). */
function useDesktop() {
  return React.useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(min-width: 1024px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}

const isTyping = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  return Boolean(n && (n.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(n.tagName)));
};

export function ApplyWorkspace(props: Props) {
  const t = useTranslations("workspace");
  const router = useRouter();
  const { student, style, subscription, master } = props;
  const renderStyle = style as RenderStyle;
  const disabled = !subscription.active;
  const desktop = useDesktop();

  // ── Job input ──
  const [defaults, setDefaults] = React.useState<WorkspaceDefaults | null>(props.defaults);
  const [job, setJob] = React.useState<JobState>(() => jobWithDefaults(props.defaults));
  const patchJob = React.useCallback((p: Partial<JobState>) => setJob((j) => ({ ...j, ...p })), []);
  const { dup, checking, run: runDup, reset: resetDup } = useDuplicateCheck(student.id);
  const [confirmSimilar, setConfirmSimilar] = React.useState(false);
  const [jobOpen, setJobOpen] = React.useState(true);

  // ── Generation ──
  const [step, setStep] = React.useState<GenStep | null>(null);
  const [genError, setGenError] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [tailor, setTailor] = React.useState<TailorState | null>(null);
  const [content, setContent] = React.useState<ResumeData | null>(null);
  const [serverValidation, setServerValidation] = React.useState<ValidationResult | null>(null);
  const [save, setSave] = React.useState<SaveState>("idle");
  const saveTimer = React.useRef<number | null>(null);
  const pendingSave = React.useRef<Promise<boolean> | null>(null);

  // ── Cover letter ──
  const [cover, setCover] = React.useState("");
  const [coverGenerating, setCoverGenerating] = React.useState(false);
  const [coverSaving, setCoverSaving] = React.useState(false);
  const coverTimer = React.useRef<number | null>(null);

  // ── Logging ──
  const [markOpen, setMarkOpen] = React.useState(false);
  const [marking, setMarking] = React.useState(false);
  const [quickOpen, setQuickOpen] = React.useState(false);
  const [today, setToday] = React.useState(props.today);
  const [rightTab, setRightTab] = React.useState<"preview" | "edit" | "keywords" | "cover">("preview");
  const [sideTab, setSideTab] = React.useState<"edit" | "keywords" | "cover">("edit");
  const generateRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => setToday(props.today), [props.today]);

  // Live, client-side validation + score (authoritative copies come from the server on save).
  const liveValidation = React.useMemo(() => (content && master ? validateTailored(master, content) : null), [content, master]);
  const validation = liveValidation ?? serverValidation;
  const liveScore = React.useMemo<AtsBreakdown | null>(() => (content && tailor ? computeAtsScore({ resume: content, analysis: tailor.analysis, jobTitle: job.jobTitle || tailor.content.basics.headline || "", maxPages: style.maxPages, includePhoto: style.includePhoto }) : null), [content, tailor, job.jobTitle, style.maxPages, style.includePhoto]);
  const preview = usePreview(student.id, content ?? master);
  const pagesOver = preview.pageCount > style.maxPages;

  const jdLen = job.jd.trim().length;
  const formReady = Boolean(job.jobUrl.trim() && job.companyName.trim() && job.jobTitle.trim() && jdLen >= JD_MIN && jdLen <= JD_MAX);
  const canGenerate = formReady && !generating && !disabled && Boolean(master) && !dup?.block && !tailor?.locked;

  // ── Save (debounced autosave of editor changes) ──
  // editSeq counts edits; a save covers the edits up to the seq it started with,
  // so edits made while a save is in flight are saved by a follow-up save.
  const editSeq = React.useRef(0);
  const savedSeq = React.useRef(0);
  const latest = React.useRef<{ content: ResumeData | null; tailor: TailorState | null; jobTitle: string }>({ content: null, tailor: null, jobTitle: "" });
  latest.current = { content, tailor, jobTitle: job.jobTitle };

  const flushSave = React.useCallback(async (): Promise<boolean> => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingSave.current) await pendingSave.current;
    const { content: c, tailor: tl, jobTitle } = latest.current;
    if (!tl || tl.locked || !c) return true;
    if (editSeq.current === savedSeq.current) return true;
    const seq = editSeq.current;
    setSave("saving");
    const p = saveVersionAction(tl.versionId, c, jobTitle).then((r) => {
      pendingSave.current = null;
      if (!r.ok) {
        setSave("error");
        toast.error(r.error);
        return false;
      }
      savedSeq.current = seq;
      setServerValidation(r.data.validation);
      setSave(editSeq.current === seq ? "saved" : "dirty");
      return true;
    });
    pendingSave.current = p;
    const ok = await p;
    // Edits arrived during the save: save them too.
    if (ok && editSeq.current !== savedSeq.current) return flushSaveRef.current();
    return ok;
  }, []);
  const flushSaveRef = React.useRef(flushSave);

  const onEdit = (next: ResumeData) => {
    setContent(next);
    editSeq.current++;
    setSave("dirty");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushSaveRef.current(), 1200);
  };

  // ── Generate (streamed NDJSON progress) ──
  const generate = React.useCallback(async () => {
    if (!canGenerate) {
      if (!formReady) toast.error(t("errors.formIncomplete", { min: JD_MIN }));
      return;
    }
    setGenerating(true);
    setGenError(null);
    setStep("analysing");
    setJobOpen(true);
    try {
      const res = await fetch("/api/resumes/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, jd: job.jd, company: job.companyName, title: job.jobTitle, location: job.location || null }),
      });
      if (!res.body || !res.headers.get("content-type")?.includes("ndjson")) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("errors.generic"));
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line) as { type: string; step?: GenStep; error?: string } & Record<string, unknown>;
          if (msg.type === "step" && msg.step) setStep(msg.step);
          else if (msg.type === "error") throw new Error(msg.error ?? t("errors.generic"));
          else if (msg.type === "result") {
            const r = msg as unknown as Omit<TailorState, "locked" | "serverValidation"> & { validation: TailorState["serverValidation"]; tailored: AtsBreakdown };
            editSeq.current = 0;
            savedSeq.current = 0;
            setTailor({ versionId: r.versionId, content: r.content, analysis: r.analysis, serverValidation: r.validation, base: r.base, pages: r.pages, aiUnavailable: r.aiUnavailable, locked: false });
            setContent(r.content);
            setServerValidation(r.validation);
            setSave("saved");
            setCover("");
            setStep("done");
            setJobOpen(false);
            setRightTab("preview");
            setSideTab(r.validation.ok ? "keywords" : "edit");
            if (r.aiUnavailable) toast.message(t("aiOffToast"));
            else if (!r.validation.ok) toast.error(t("validationFailedToast"));
            else toast.success(t("generatedToast", { score: r.tailored.score }));
          }
        }
      }
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [canGenerate, formReady, job, student.id, t]);

  // ── Cover letter ──
  const onCoverChange = (v: string) => {
    setCover(v);
    if (!tailor || tailor.locked) return;
    if (coverTimer.current) window.clearTimeout(coverTimer.current);
    coverTimer.current = window.setTimeout(async () => {
      setCoverSaving(true);
      const r = await saveCoverLetterAction(tailor.versionId, v);
      setCoverSaving(false);
      if (!r.ok) toast.error(r.error);
    }, 1000);
  };
  const generateCover = async () => {
    if (!tailor) return;
    setCoverGenerating(true);
    const r = await generateCoverLetterAction({ versionId: tailor.versionId, jd: job.jd, company: job.companyName, title: job.jobTitle, location: job.location || null });
    setCoverGenerating(false);
    if (r.ok) {
      setCover(r.data.coverLetter);
      for (const w of r.data.warnings) toast.warning(w);
    } else toast.error(r.error);
  };

  // ── Mark as applied ──
  const blockedReason = disabled
    ? t("inactive.short")
    : !tailor
      ? t("errors.noResume")
      : validation && !validation.ok
        ? t("errors.validationBlocks")
        : dup?.block
          ? dup.block.message
          : !formReady
            ? t("errors.formIncomplete", { min: JD_MIN })
            : null;

  const openMark = React.useCallback(async () => {
    if (!tailor || tailor.locked) return;
    await runDup(job, true);
    setMarkOpen(true);
  }, [tailor, job, runDup]);

  const submitMark = async (proof: { file: File | null; text: string }) => {
    if (!tailor) return;
    setMarking(true);
    const ok = await flushSave();
    if (!ok) {
      setMarking(false);
      return;
    }
    if (coverTimer.current) {
      window.clearTimeout(coverTimer.current);
      coverTimer.current = null;
    }
    const fd = new FormData();
    fd.set("studentId", student.id);
    for (const [k, v] of Object.entries(job)) if (k !== "jd") fd.set(k, v);
    fd.set("jdText", job.jd);
    fd.set("resumeVersionId", tailor.versionId);
    if (cover.trim()) fd.set("coverLetter", cover.trim());
    if (proof.file) fd.set("proof", proof.file);
    if (proof.text.trim()) fd.set("proofText", proof.text.trim());
    if (confirmSimilar) fd.set("confirmSimilar", "1");
    const r = await markAppliedAction(fd);
    setMarking(false);
    if (r.ok) {
      setToday(r.data.today);
      setDefaults({ source: job.source, workMode: job.workMode || null, employmentType: job.employmentType || null, location: job.location || null });
      setTailor((s) => (s ? { ...s, locked: true, applicationId: r.data.applicationId } : s));
      setMarkOpen(false);
      toast.success(t("loggedToast", { company: job.companyName, applied: r.data.today.applied, target: r.data.today.target }));
      router.refresh();
    } else {
      toast.error(r.error);
      void runDup(job, true);
    }
  };

  // ── New application ──
  const reset = React.useCallback(() => {
    if (tailor && !tailor.locked && !window.confirm(t("confirmDiscard"))) return;
    setJob(jobWithDefaults(defaults));
    setTailor(null);
    setContent(null);
    setServerValidation(null);
    setStep(null);
    setGenError(null);
    setCover("");
    setConfirmSimilar(false);
    setSave("idle");
    editSeq.current = 0;
    savedSeq.current = 0;
    setJobOpen(true);
    resetDup();
    window.setTimeout(() => document.getElementById("job-jobUrl")?.focus(), 0);
  }, [tailor, resetDup, t, defaults]);

  // ── AI editor assists (D-101): the server validates; the editor shows before/after ──
  const aiAssist = React.useMemo<AiAssist | null>(() => {
    if (!tailor || tailor.locked) return null;
    return {
      request: async (req) => {
        const c = latest.current.content;
        if (!c) return { error: t("errors.noResume") };
        const r = await suggestEditAction({ versionId: tailor.versionId, mode: req.mode, target: req.target, content: c, jobTitle: job.jobTitle || null, company: job.companyName || null, jd: job.jd || null });
        return r.ok ? { suggestion: r.data } : { error: r.error };
      },
    };
  }, [tailor, job.jobTitle, job.companyName, job.jd, t]);

  // ── Keyboard shortcuts: ⌘/Ctrl+Enter generate, ⌘/Ctrl+S mark applied, N new ──
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        void generate();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (markOpen) return; // the dialog handles its own ⌘S
        if (!tailor) toast.error(t("errors.noResume"));
        else if (tailor.locked) toast.message(t("alreadyLogged"));
        else void openMark();
      } else if (!mod && !e.altKey && (e.key === "n" || e.key === "N") && !isTyping(e.target) && !markOpen && !quickOpen) {
        e.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [generate, openMark, reset, tailor, markOpen, quickOpen, t]);

  // Warn before leaving with unsaved edits.
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (save === "dirty" || save === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [save]);

  const download = async (format: "pdf" | "docx") => {
    if (!tailor) return;
    if (!(await flushSave())) return;
    window.location.href = `/api/resumes/${tailor.versionId}/${format}`;
  };

  const pct = today.target > 0 ? Math.round((today.applied / today.target) * 100) : 0;

  // ─────────────────────────── Render ───────────────────────────
  const previewPane = (
    <PreviewPane pages={preview.pages} loading={preview.loading} error={preview.error} label={tailor ? t("preview.tailored") : t("preview.base")} pageCount={preview.pageCount} maxPages={style.maxPages} hasContent={Boolean(content ?? master)} />
  );
  const editorPane = tailor && content && master ? (
    <ResumeEditor value={content} master={master} style={renderStyle} locked={tailor.locked || disabled} issues={[...(validation?.errors ?? []), ...(validation?.warnings ?? [])]} onChange={onEdit} ai={disabled ? null : aiAssist} />
  ) : (
    <EmptyState icon={<Pencil className="h-5 w-5" aria-hidden="true" />} title={t("editor.emptyTitle")} body={t("editor.emptyBody")} className="bg-surface" />
  );
  const keywordsPane = tailor ? <KeywordPanel ats={liveScore} profileSkills={props.profileSkills} studentId={props.student.id} onProfileChanged={() => router.refresh()} /> : <EmptyState title={t("keywords.emptyTitle")} body={t("keywords.emptyBody")} className="bg-surface" />;
  const coverPane = tailor ? (
    <CoverLetterPanel value={cover} onChange={onCoverChange} onGenerate={generateCover} generating={coverGenerating} aiEnabled={props.aiEnabled} locked={tailor.locked || disabled} saving={coverSaving} />
  ) : (
    <EmptyState title={t("cover.emptyTitle")} body={t("cover.emptyBody")} className="bg-surface" />
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <Link href={`/work/students/${student.id}`} className="mb-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground sm:min-h-0">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("backToStudent", { name: student.name })}
          </Link>
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em] sm:text-[28px]">{t("title", { name: student.name })}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {subscription.planName ? <Badge tone="ink">{subscription.planName}</Badge> : null}
            <Badge tone="blue">{t("header.target", { n: subscription.dailyTarget })}</Badge>
            <Badge tone="slate">
              {props.style.styleName} · {style.pageSize === "A4" ? "A4" : t("header.letter")} · {style.spelling}
            </Badge>
            {!subscription.active ? <Badge tone="red">{t("header.inactive")}</Badge> : null}
            {!props.aiEnabled ? <Badge tone="amber">{t("header.aiOff")}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-stretch gap-2.5">
          <div className="min-w-[220px] flex-1 rounded-[16px] border border-border bg-surface px-4 py-3 xl:flex-none" aria-live="polite">
            <p className="text-sm font-semibold">
              <span className="text-muted-foreground">{t("header.todayLabel")}</span> <span className="tabular text-[17px]">{today.applied}</span>
              <span className="tabular text-muted-foreground"> / {today.target}</span> <span className="text-muted-foreground">{t("header.forName", { name: student.firstName })}</span>
            </p>
            <Progress className="mt-2" value={today.applied} max={Math.max(1, today.target)} label={t("header.progressLabel", { pct })} tone={pct >= 100 ? "green" : "brand"} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setQuickOpen(true)} disabled={disabled}>
              <Zap className="h-4 w-4" aria-hidden="true" />
              {t("quickLog")}
            </Button>
            <Link href={`/work/students/${student.id}/import`} className={cn(buttonVariants({ variant: "outline" }), disabled && "pointer-events-none opacity-55")} aria-disabled={disabled}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {t("bulkImport")}
            </Link>
          </div>
        </div>
      </div>

      {disabled ? (
        <div role="alert" className="flex items-start gap-3 rounded-[16px] border border-border bg-surface-muted px-5 py-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-bold">{t("inactive.title")}</p>
            <p className="text-sm text-muted-foreground">{t("inactive.body", { name: student.firstName, status: subscription.status ?? t("inactive.none") })}</p>
          </div>
        </div>
      ) : null}

      {!master ? (
        <div role="alert" className="flex items-start gap-3 rounded-[16px] border border-warning/40 bg-[#FDF3E1] px-5 py-4 text-[#7A4E0E]">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">{t("noMaster.title")}</p>
            <p className="text-sm">{t("noMaster.body", { name: student.firstName })}</p>
            {props.masterIssues.length && student.hasMaster ? <p className="mt-1 font-mono text-xs">{props.masterIssues.join(" · ")}</p> : null}
          </div>
        </div>
      ) : null}

      <div className={cn("grid gap-5 lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]", disabled && "opacity-70")}>
        {/* ── Left: input (then editor on desktop) ── */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-bold">{t("job.heading")}</h2>
              {tailor ? (
                <button type="button" onClick={() => setJobOpen((o) => !o)} aria-expanded={jobOpen} aria-controls="job-form-body" className="inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 text-sm font-semibold text-primary">
                  {jobOpen ? t("job.collapse") : t("job.expand")}
                  <ChevronDown className={cn("h-4 w-4 transition-transform", jobOpen && "rotate-180")} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {tailor && !jobOpen ? (
              <div className="space-y-1 text-[14px]">
                <p className="font-bold">{job.jobTitle}</p>
                <p className="text-muted-foreground">
                  {job.companyName}
                  {job.location ? ` · ${job.location}` : ""}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">{job.jobUrl}</p>
              </div>
            ) : (
              <div id="job-form-body" className="flex flex-col gap-4">
                <JobForm
                  job={job}
                  onChange={(p) => {
                    patchJob(p);
                    if ("jobUrl" in p || "companyName" in p || "jobTitle" in p) setConfirmSimilar(false);
                  }}
                  onBlurCheck={(j) => void runDup(j)}
                  companies={props.companies}
                  disabled={disabled || Boolean(tailor?.locked)}
                />
              </div>
            )}
            <div className="mt-4 flex flex-col gap-3">
              {checking ? (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("duplicates.checking")}
                </p>
              ) : null}
              <DuplicateNotice dup={dup} confirmed={confirmSimilar} onConfirm={setConfirmSimilar} idPrefix="ws" />
              {!tailor?.locked ? (
                <Button ref={generateRef} size="lg" onClick={() => void generate()} disabled={!canGenerate} loading={generating} className="w-full">
                  {!generating ? <Sparkles className="h-5 w-5" aria-hidden="true" /> : null}
                  {tailor ? t("regenerate") : t("generate")}
                  <kbd className="ml-1 hidden rounded bg-white/20 px-1.5 text-[11px] font-semibold sm:inline">⌘↵</kbd>
                </Button>
              ) : null}
              {!props.aiEnabled && !tailor ? <p className="text-[13px] text-muted-foreground">{t("aiOffHint")}</p> : null}
            </div>
          </Card>

          {step && (generating || genError || step !== "done") ? <GenerationProgress step={step} error={genError} /> : null}

          {tailor ? (
            <>
              {tailor.locked ? (
                <div className="rounded-[16px] border border-success/30 bg-[#E6F4EC] p-5 text-[#17633f]" role="status">
                  <p className="flex items-center gap-2 text-[16px] font-bold">
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    {t("logged.title")}
                  </p>
                  <p className="mt-1 text-sm">{t("logged.body", { name: student.firstName })}</p>
                  <Button className="mt-3 w-full" onClick={reset}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t("newApplication")}
                    <kbd className="ml-1 rounded bg-white/20 px-1.5 text-[11px] font-semibold">N</kbd>
                  </Button>
                </div>
              ) : null}
              <ValidationPanel result={validation} attempts={tailor.serverValidation.attempts} aiUnavailable={tailor.aiUnavailable} />
            </>
          ) : null}

          {desktop ? (
            <Tabs value={sideTab} onValueChange={(v) => setSideTab(v as typeof sideTab)} className="min-w-0">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="edit" className="justify-center">
                  {t("tabs.edit")}
                </TabsTrigger>
                <TabsTrigger value="keywords" className="justify-center">
                  {t("tabs.keywords")}
                </TabsTrigger>
                <TabsTrigger value="cover" className="justify-center">
                  {t("tabs.cover")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="edit" className="mt-3">
                {editorPane}
              </TabsContent>
              <TabsContent value="keywords" className="mt-3">
                <Card className="p-5">{keywordsPane}</Card>
              </TabsContent>
              <TabsContent value="cover" className="mt-3">
                <Card className="p-5">{coverPane}</Card>
              </TabsContent>
            </Tabs>
          ) : null}
          {desktop ? (
            <>
              <RecentList recent={props.recent} tz={props.employeeTimezone} />
              <ShortcutHelp />
            </>
          ) : null}
        </div>

        {/* ── Right: output ── */}
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[76px] lg:self-start">
          <Card className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
            <ScoreChip base={tailor?.base ?? null} tailored={liveScore} />
            {!tailor ? <p className="px-1 text-sm text-muted-foreground">{t("toolbar.before")}</p> : null}
            {tailor ? <SaveIndicator state={save} locked={tailor.locked} /> : null}
            {pagesOver ? (
              <Badge tone="amber">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {t("toolbar.pagesOver", { pages: preview.pageCount, max: style.maxPages })}
              </Badge>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void download("pdf")} disabled={!tailor}>
                <FileDown className="h-4 w-4" aria-hidden="true" />
                {t("toolbar.pdf")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void download("docx")} disabled={!tailor}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                {t("toolbar.docx")}
              </Button>
              {!tailor?.locked ? (
                <Button variant="success" size="sm" onClick={() => void openMark()} disabled={!tailor || disabled} title={blockedReason ?? undefined}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {t("markApplied")}
                  <kbd className="ml-1 hidden rounded bg-white/20 px-1.5 text-[11px] font-semibold sm:inline">⌘S</kbd>
                </Button>
              ) : (
                <Badge tone="green" className="h-9 px-3">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("toolbar.locked")}
                </Badge>
              )}
            </div>
          </Card>

          {desktop ? (
            <div className="lg:max-h-[calc(100dvh-170px)] lg:overflow-y-auto lg:rounded-[18px]">{previewPane}</div>
          ) : (
            <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as typeof rightTab)}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="preview" className="justify-center px-2">
                  {t("tabs.preview")}
                </TabsTrigger>
                <TabsTrigger value="edit" className="justify-center px-2">
                  {t("tabs.edit")}
                </TabsTrigger>
                <TabsTrigger value="keywords" className="justify-center px-2">
                  {t("tabs.keywordsShort")}
                </TabsTrigger>
                <TabsTrigger value="cover" className="justify-center px-2">
                  {t("tabs.coverShort")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="mt-3">
                {previewPane}
              </TabsContent>
              <TabsContent value="edit" className="mt-3">
                {editorPane}
              </TabsContent>
              <TabsContent value="keywords" className="mt-3">
                <Card className="p-5">{keywordsPane}</Card>
              </TabsContent>
              <TabsContent value="cover" className="mt-3">
                <Card className="p-5">{coverPane}</Card>
              </TabsContent>
            </Tabs>
          )}
          {!desktop ? <RecentList recent={props.recent} tz={props.employeeTimezone} /> : null}
        </div>
      </div>

      <MarkAppliedDialog
        open={markOpen}
        onOpenChange={setMarkOpen}
        summary={{ company: job.companyName, title: job.jobTitle, studentFirstName: student.firstName, score: liveScore?.score }}
        dup={dup}
        confirmSimilar={confirmSimilar}
        setConfirmSimilar={setConfirmSimilar}
        onSubmit={(p) => void submitMark(p)}
        pending={marking}
        blockedReason={blockedReason}
      />
      <QuickLogDialog open={quickOpen} onOpenChange={setQuickOpen} studentId={student.id} companies={props.companies} defaults={defaults} disabled={disabled} onLogged={setToday} />
    </div>
  );
}

function SaveIndicator({ state, locked }: { state: SaveState; locked: boolean }) {
  const t = useTranslations("workspace.save");
  if (locked) return null;
  const label = { idle: "", dirty: t("dirty"), saving: t("saving"), saved: t("saved"), error: t("error") }[state];
  if (!label) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px]", state === "error" ? "text-danger" : "text-muted-foreground")} role="status">
      {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : state === "saved" ? <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

function PreviewPane({ pages, loading, error, label, pageCount, maxPages, hasContent }: { pages: { src: string; width: number; height: number }[]; loading: boolean; error: string | null; label: string; pageCount: number; maxPages: number; hasContent: boolean }) {
  const t = useTranslations("workspace.preview");
  if (!hasContent) return <EmptyState title={t("emptyTitle")} body={t("emptyBody")} className="bg-surface" />;
  return (
    <div className="rounded-[18px] border border-border bg-surface-muted p-3">
      <div className="mb-2 flex items-center justify-between px-1 text-[13px]">
        <span className="font-semibold text-muted-foreground">{label}</span>
        <span className="flex items-center gap-2 text-muted-foreground" aria-live="polite">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          {pageCount ? <span className={cn("tabular", pageCount > maxPages && "font-semibold text-warning")}>{t("pages", { n: pageCount, max: maxPages })}</span> : null}
        </span>
      </div>
      {error ? (
        <p role="alert" className="rounded-[10px] bg-[#FCEAE8] px-3 py-2 text-[13px] text-[#A82A21]">
          {error}
        </p>
      ) : null}
      <div className={cn("flex flex-col gap-3 transition-opacity", loading && pages.length ? "opacity-70" : "")}>
        {pages.length ? (
          pages.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={p.src} width={p.width} height={p.height} alt={t("pageAlt", { n: i + 1 })} className="h-auto w-full rounded-[6px] bg-white shadow-[0_1px_2px_rgba(11,24,70,0.08),0_8px_24px_-12px_rgba(11,24,70,0.25)]" />
          ))
        ) : (
          <div className="flex aspect-[8.5/11] w-full items-center justify-center rounded-[6px] bg-white text-muted-foreground shadow-sm">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            <span className="sr-only">{t("loading")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RecentList({ recent, tz }: { recent: RecentApp[]; tz: string }) {
  const t = useTranslations("workspace.recent");
  if (!recent.length) return null;
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" });
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-[15px] font-bold">{t("title")}</h2>
      <ul className="flex flex-col divide-y divide-border">
        {recent.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{r.jobTitle}</p>
              <p className="truncate text-[13px] text-muted-foreground">
                {r.companyName} · {fmt.format(new Date(r.appliedAt))}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <StatusPill status={r.status} />
              {r.resumeVersionId ? (
                <a href={`/api/resumes/${r.resumeVersionId}/pdf`} className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-surface-muted" aria-label={t("download", { company: r.companyName })}>
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ShortcutHelp() {
  const t = useTranslations("workspace.shortcuts");
  return (
    <details className="hidden rounded-[16px] border border-border bg-surface px-5 py-3 text-[13px] lg:block">
      <summary className="flex min-h-9 cursor-pointer items-center gap-2 font-semibold text-muted-foreground">
        <Keyboard className="h-4 w-4" aria-hidden="true" />
        {t("title")}
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt>
          <kbd className="rounded border border-border bg-surface-muted px-1.5 font-semibold">⌘/Ctrl + Enter</kbd>
        </dt>
        <dd>{t("generate")}</dd>
        <dt>
          <kbd className="rounded border border-border bg-surface-muted px-1.5 font-semibold">⌘/Ctrl + S</kbd>
        </dt>
        <dd>{t("mark")}</dd>
        <dt>
          <kbd className="rounded border border-border bg-surface-muted px-1.5 font-semibold">N</kbd>
        </dt>
        <dd>{t("new")}</dd>
        <dt>
          <kbd className="rounded border border-border bg-surface-muted px-1.5 font-semibold">Alt + ↑/↓</kbd>
        </dt>
        <dd>{t("move")}</dd>
      </dl>
    </details>
  );
}
