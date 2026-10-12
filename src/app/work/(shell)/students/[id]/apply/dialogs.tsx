"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ImagePlus, Zap } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DuplicateNotice, JobForm, useDuplicateCheck } from "./job-form";
import { listVersionsAction, quickLogAction } from "./actions";
import { EMPTY_JOB, type DuplicateState, type JobState } from "./types";

const PROOF_MAX = 3 * 1024 * 1024;

/** Proof of application: screenshot (PNG/JPG ≤ 3 MB) or pasted confirmation text. */
export function ProofInput({ idPrefix, file, setFile, text, setText }: { idPrefix: string; file: File | null; setFile: (f: File | null) => void; text: string; setText: (v: string) => void }) {
  const t = useTranslations("workspace.proof");
  const [err, setErr] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"file" | "text">(text ? "text" : "file");
  const onPick = (f: File | null) => {
    setErr(null);
    if (!f) return setFile(null);
    if (!["image/png", "image/jpeg"].includes(f.type)) return setErr(t("badType"));
    if (f.size > PROOF_MAX) return setErr(t("tooBig"));
    setFile(f);
  };
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">
        {t("label")} <span className="font-normal text-muted-foreground">({t("optional")})</span>
      </p>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "file" | "text")}>
        <TabsList aria-label={t("label")}>
          <TabsTrigger value="file">{t("screenshot")}</TabsTrigger>
          <TabsTrigger value="text">{t("pasteText")}</TabsTrigger>
        </TabsList>
        <TabsContent value="file" className="mt-3">
          <label
            htmlFor={`${idPrefix}-proof`}
            className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] border-dashed border-border-strong px-4 py-4 text-center text-sm text-muted-foreground hover:border-primary hover:bg-accent/40"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onPick(e.dataTransfer.files?.[0] ?? null);
            }}
            onPaste={(e) => {
              const f = [...e.clipboardData.files][0];
              if (f) onPick(f);
            }}
          >
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
            {file ? (
              <span className="font-semibold text-foreground">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </span>
            ) : (
              <span>{t("dropHint")}</span>
            )}
            <input
              id={`${idPrefix}-proof`}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(e) => {
                onPick(e.target.files?.[0] ?? null);
                if (e.target.files?.[0]) setText("");
              }}
            />
          </label>
          {file ? (
            <Button type="button" variant="link" size="sm" className="mt-1" onClick={() => setFile(null)}>
              {t("removeFile")}
            </Button>
          ) : null}
          {err ? (
            <p role="alert" className="mt-1 text-[13px] font-medium text-danger">
              {err}
            </p>
          ) : null}
        </TabsContent>
        <TabsContent value="text" className="mt-3">
          <Textarea
            aria-label={t("pasteText")}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) setFile(null);
            }}
            placeholder={t("textPlaceholder")}
            className="min-h-28 text-[14px]"
            maxLength={20000}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function MarkAppliedDialog({
  open,
  onOpenChange,
  summary,
  dup,
  confirmSimilar,
  setConfirmSimilar,
  onSubmit,
  pending,
  blockedReason,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  summary: { company: string; title: string; studentFirstName: string; score?: number | null };
  dup: DuplicateState | null;
  confirmSimilar: boolean;
  setConfirmSimilar: (v: boolean) => void;
  onSubmit: (proof: { file: File | null; text: string }) => void;
  pending: boolean;
  blockedReason: string | null;
}) {
  const t = useTranslations("workspace.mark");
  const [file, setFile] = React.useState<File | null>(null);
  const [text, setText] = React.useState("");
  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setText("");
    }
  }, [open]);
  const needsConfirm = Boolean(dup?.warnings.length) && !confirmSimilar;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("title")} description={t("description", { title: summary.title, company: summary.company, name: summary.studentFirstName })}>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!blockedReason && !needsConfirm) onSubmit({ file, text });
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
              e.preventDefault();
              if (!blockedReason && !needsConfirm && !pending) onSubmit({ file, text });
            }
          }}
        >
          <ul className="space-y-1.5 rounded-[12px] bg-surface-muted px-4 py-3 text-[14px]">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              {t("lockNote")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              {t("studentSees", { name: summary.studentFirstName })}
            </li>
          </ul>
          <DuplicateNotice dup={dup} confirmed={confirmSimilar} onConfirm={setConfirmSimilar} idPrefix="mark" />
          {blockedReason ? (
            <p role="alert" className="rounded-[12px] bg-[#FCEAE8] px-4 py-3 text-[14px] font-medium text-[#A82A21]">
              {blockedReason}
            </p>
          ) : null}
          <ProofInput idPrefix="mark" file={file} setFile={setFile} text={text} setText={setText} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="success" loading={pending} disabled={Boolean(blockedReason) || needsConfirm} autoFocus>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {t("confirm")}
              <kbd className="ml-1 hidden rounded bg-white/20 px-1.5 text-[11px] font-semibold sm:inline">⌘S</kbd>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type VersionRow = { id: string; kind: "BASE" | "TAILORED" | "MASTER_UPLOAD"; title: string; createdAt: string; lockedAt: string | null; atsScore: number | null };

/** Quick log without AI: base resume or a reused version (same duplicate rules). */
export function QuickLogDialog({ open, onOpenChange, studentId, companies, disabled, onLogged }: { open: boolean; onOpenChange: (v: boolean) => void; studentId: string; companies: string[]; disabled: boolean; onLogged: (today: { applied: number; target: number }) => void }) {
  const t = useTranslations("workspace.quick");
  const router = useRouter();
  const [job, setJob] = React.useState<JobState>(EMPTY_JOB);
  const [versions, setVersions] = React.useState<VersionRow[] | null>(null);
  const [versionId, setVersionId] = React.useState("base");
  const [file, setFile] = React.useState<File | null>(null);
  const [text, setText] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({});
  const { dup, run, reset } = useDuplicateCheck(studentId);

  React.useEffect(() => {
    if (!open) return;
    setJob(EMPTY_JOB);
    setVersionId("base");
    setFile(null);
    setText("");
    setConfirm(false);
    setErrors({});
    reset();
    listVersionsAction(studentId).then((r) => {
      if (r.ok) setVersions(r.data as VersionRow[]);
    });
  }, [open, studentId, reset]);

  const submit = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("studentId", studentId);
      for (const [k, v] of Object.entries(job)) if (k !== "jd") fd.set(k, v);
      fd.set("resumeVersionId", versionId);
      if (file) fd.set("proof", file);
      if (text) fd.set("proofText", text);
      if (confirm) fd.set("confirmSimilar", "1");
      const r = await quickLogAction(fd);
      if (r.ok) {
        toast.success(t("logged", { company: job.companyName }));
        onLogged((r.data as { today: { applied: number; target: number } }).today);
        onOpenChange(false);
        router.refresh();
      } else {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(r.error);
        void run(job, true);
      }
    });

  const tailored = (versions ?? []).filter((v) => v.kind === "TAILORED");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title={t("title")} description={t("description")}>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <JobForm idPrefix="quick" job={job} onChange={(p) => setJob((j) => ({ ...j, ...p }))} onBlurCheck={(j) => void run(j)} companies={companies} disabled={disabled} showJd={false} errors={errors} />
          <Field id="quick-version" label={t("resume")} hint={t("resumeHint")}>
            <Select {...fieldA11y("quick-version", null, true)} value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              <option value="base">{t("baseResume")}</option>
              {tailored.length ? (
                <optgroup label={t("previousVersions")}>
                  {tailored.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title}
                      {v.atsScore ? ` · ATS ${v.atsScore}` : ""}
                      {v.lockedAt ? ` · ${t("used")}` : ""}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </Select>
          </Field>
          <DuplicateNotice dup={dup} confirmed={confirm} onConfirm={setConfirm} idPrefix="quick" />
          <ProofInput idPrefix="quick" file={file} setFile={setFile} text={text} setText={setText} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={pending} disabled={disabled || Boolean(dup?.block) || (Boolean(dup?.warnings.length) && !confirm)}>
              <Zap className="h-4 w-4" aria-hidden="true" />
              {t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
