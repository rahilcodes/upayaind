"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, ChevronDown, Eye, EyeOff, GripVertical, Loader2, Lock, Plus, RotateCcw, Scissors, Sparkles, Target, Trash2, X } from "lucide-react";
import type { ResumeData, SectionKey } from "@/resume/schema";
import { SECTION_KEYS } from "@/resume/schema";
import { sectionHeading, dateRange, type RenderStyle } from "@/resume/styles";
import type { ValidationIssue } from "@/server/ai/validators";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** AI assists (D-101): the server rewrites + validates; the editor shows before/after and the employee accepts or rejects. */
export type AiEditMode = "improve" | "shorten" | "match" | "summary";
export type AiEditTarget = { kind: "bullet"; experienceId: string; bulletId: string } | { kind: "summary" };
export type AiSuggestion = { before: string; after: string; unchanged: boolean; keywordsUsed: string[] };
export type AiAssist = { request: (req: { mode: AiEditMode; target: AiEditTarget }) => Promise<{ suggestion: AiSuggestion } | { error: string }> };

type Props = {
  value: ResumeData;
  master: ResumeData;
  style: RenderStyle;
  locked: boolean;
  issues: ValidationIssue[];
  onChange: (next: ResumeData) => void;
  ai?: AiAssist | null;
};

type Pending = { mode: AiEditMode; loading: true } | { mode: AiEditMode; loading: false; suggestion: AiSuggestion };

/** Word-level diff (LCS) for the before/after view. */
export function wordDiff(before: string, after: string): { type: "same" | "del" | "ins"; text: string }[] {
  const a = before.split(/(\s+)/).filter((x) => x.length);
  const b = after.split(/(\s+)/).filter((x) => x.length);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: { type: "same" | "del" | "ins"; text: string }[] = [];
  const push = (type: "same" | "del" | "ins", text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) push("del", a[i++]!);
    else push("ins", b[j++]!);
  }
  while (i < n) push("del", a[i++]!);
  while (j < m) push("ins", b[j++]!);
  return out;
}

/** Before/after panel with Accept / Reject (also used for the summary). */
function SuggestionPanel({ pending, label, onAccept, onReject }: { pending: Pending; label: string; onAccept: () => void; onReject: () => void }) {
  const t = useTranslations("workspace.editor.ai");
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!pending.loading) ref.current?.querySelector<HTMLButtonElement>("button[data-accept]")?.focus();
  }, [pending.loading]);
  if (pending.loading) {
    return (
      <p className="mx-2 mb-1 flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("working", { mode: t(`mode.${pending.mode}`) })}
      </p>
    );
  }
  const sg = pending.suggestion;
  const parts = wordDiff(sg.before, sg.after);
  return (
    <div ref={ref} role="group" aria-label={t("panelLabel", { label })} className="mx-1 mb-1 rounded-[12px] border border-primary/30 bg-accent/40 p-3 text-[14px]">
      <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-primary">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {t("suggestion", { mode: t(`mode.${pending.mode}`) })}
      </p>
      {sg.unchanged ? (
        <p className="text-muted-foreground">{t("unchanged")}</p>
      ) : (
        <>
          <p className="sr-only">{t("beforeSr", { text: sg.before })}</p>
          <p className="sr-only">{t("afterSr", { text: sg.after })}</p>
          <p aria-hidden="true" className="leading-relaxed">
            {parts.map((p, i) =>
              p.type === "same" ? (
                <span key={i}>{p.text}</span>
              ) : p.type === "del" ? (
                <del key={i} className="rounded bg-[#FCEAE8] px-0.5 text-[#A82A21] decoration-[#A82A21]/60">
                  {p.text}
                </del>
              ) : (
                <ins key={i} className="rounded bg-[#E6F4EC] px-0.5 font-semibold text-[#17633f] no-underline">
                  {p.text}
                </ins>
              ),
            )}
          </p>
          {sg.keywordsUsed.length ? <p className="mt-1.5 text-[12px] text-muted-foreground">{t("keywords", { list: sg.keywordsUsed.join(", ") })}</p> : null}
        </>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {!sg.unchanged ? (
          <Button type="button" size="sm" data-accept onClick={onAccept}>
            <Check className="h-4 w-4" aria-hidden="true" />
            {t("accept")}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant={sg.unchanged ? "outline" : "ghost"} data-accept={sg.unchanged ? "" : undefined} onClick={onReject}>
          <X className="h-4 w-4" aria-hidden="true" />
          {sg.unchanged ? t("close") : t("reject")}
        </Button>
      </div>
    </div>
  );
}

function AiButtons({ onRun, disabled, compact }: { onRun: (mode: Exclude<AiEditMode, "summary">) => void; disabled: boolean; compact?: boolean }) {
  const t = useTranslations("workspace.editor.ai");
  const cls = "inline-flex h-9 items-center gap-1 rounded-[8px] px-2 text-[12px] font-semibold text-primary hover:bg-accent disabled:opacity-40";
  return (
    <div className={cn("flex flex-wrap items-center", compact ? "gap-0" : "gap-0.5")} role="group" aria-label={t("groupLabel")}>
      <button type="button" className={cls} disabled={disabled} onClick={() => onRun("improve")} title={t("improveTitle")}>
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {t("improve")}
      </button>
      <button type="button" className={cls} disabled={disabled} onClick={() => onRun("shorten")} title={t("shortenTitle")}>
        <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
        {t("shorten")}
      </button>
      <button type="button" className={cls} disabled={disabled} onClick={() => onRun("match")} title={t("matchTitle")}>
        <Target className="h-3.5 w-3.5" aria-hidden="true" />
        {t("match")}
      </button>
    </div>
  );
}

const move = <T,>(arr: T[], from: number, to: number) => {
  const a = [...arr];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x!);
  return a;
};

const AutoTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function AutoTextarea({ className, ...props }, forwarded) {
  const inner = React.useRef<HTMLTextAreaElement | null>(null);
  React.useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof forwarded === "function") forwarded(el);
        else if (forwarded) forwarded.current = el;
      }}
      rows={1}
      className={cn("w-full resize-none overflow-hidden rounded-[8px] border border-transparent bg-transparent px-2 py-1.5 text-[14px] leading-relaxed text-foreground hover:border-border focus:border-primary focus:bg-surface focus:outline-none focus:ring-[3px] focus:ring-ring disabled:cursor-not-allowed disabled:hover:border-transparent", className)}
      {...props}
    />
  );
});

/** Sortable list with HTML5 drag-and-drop + keyboard (Alt+↑/↓ and buttons). */
function SortableBullets({ items, disabled, onChange, labelFor, itemIssue, ai }: { items: { id: string; text: string }[]; disabled: boolean; onChange: (items: { id: string; text: string }[]) => void; labelFor: (i: number) => string; itemIssue?: (i: number) => string | undefined; ai?: { request: (bulletId: string, mode: Exclude<AiEditMode, "summary">) => ReturnType<AiAssist["request"]> } | null }) {
  const t = useTranslations("workspace.editor");
  const [drag, setDrag] = React.useState<number | null>(null);
  const [over, setOver] = React.useState<number | null>(null);
  const refs = React.useRef<(HTMLTextAreaElement | null)[]>([]);
  const [pending, setPending] = React.useState<({ id: string } & Pending) | null>(null);
  const runAi = async (id: string, mode: Exclude<AiEditMode, "summary">) => {
    if (!ai) return;
    setPending({ id, mode, loading: true });
    const r = await ai.request(id, mode);
    if ("error" in r) {
      setPending(null);
      toast.error(r.error);
      return;
    }
    setPending({ id, mode, loading: false, suggestion: r.suggestion });
  };
  const focusLater = (i: number) => window.setTimeout(() => refs.current[i]?.focus(), 0);
  const shift = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    onChange(move(items, i, j));
    focusLater(j);
  };
  return (
    <ul className="flex flex-col gap-1" aria-label={t("bullets")}>
      {items.map((b, i) => {
        const issue = itemIssue?.(i);
        return (
          <li
            key={b.id}
            className={cn("group flex items-start gap-1 rounded-[10px] border border-transparent transition-colors", over === i && drag !== null && drag !== i && "border-primary/60 bg-accent/60", drag === i && "opacity-50", issue && "border-warning/50 bg-[#FDF3E1]/50")}
            draggable={!disabled}
            onDragStart={(e) => {
              setDrag(i);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(i));
            }}
            onDragOver={(e) => {
              if (drag === null) return;
              e.preventDefault();
              setOver(i);
            }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (drag !== null && drag !== i) onChange(move(items, drag, i));
              setDrag(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
          >
            <span className={cn("mt-2 cursor-grab text-subtle-foreground", disabled && "invisible")} aria-hidden="true">
              <GripVertical className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <AutoTextarea
                ref={(el) => {
                  refs.current[i] = el;
                }}
                aria-label={labelFor(i)}
                value={b.text}
                disabled={disabled}
                onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))}
                onKeyDown={(e) => {
                  if (e.altKey && e.key === "ArrowUp") {
                    e.preventDefault();
                    shift(i, -1);
                  } else if (e.altKey && e.key === "ArrowDown") {
                    e.preventDefault();
                    shift(i, 1);
                  }
                }}
              />
              {issue ? <p className="px-2 pb-1 text-xs font-medium text-[#7A4E0E]">{issue}</p> : null}
              {ai && !disabled ? (
                <div className="flex flex-wrap items-center justify-between gap-1 px-1 pb-0.5">
                  <AiButtons compact disabled={Boolean(pending?.loading) || !b.text.trim()} onRun={(mode) => void runAi(b.id, mode)} />
                </div>
              ) : null}
              {pending && pending.id === b.id ? (
                <SuggestionPanel
                  pending={pending}
                  label={labelFor(i)}
                  onAccept={() => {
                    if (!pending.loading) onChange(items.map((x) => (x.id === b.id ? { ...x, text: pending.suggestion.after } : x)));
                    setPending(null);
                    focusLater(i);
                  }}
                  onReject={() => {
                    setPending(null);
                    focusLater(i);
                  }}
                />
              ) : null}
            </div>
            {!disabled ? (
              <div className="flex shrink-0 items-center opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-surface-muted disabled:opacity-30" aria-label={t("moveUp", { n: i + 1 })} disabled={i === 0} onClick={() => shift(i, -1)}>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-surface-muted disabled:opacity-30" aria-label={t("moveDown", { n: i + 1 })} disabled={i === items.length - 1} onClick={() => shift(i, 1)}>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-[#FCEAE8] hover:text-danger" aria-label={t("deleteBullet", { n: i + 1 })} onClick={() => onChange(items.filter((_, k) => k !== i))}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function SectionCard({ title, hidden, onToggleHidden, onUp, onDown, disabled, children, count, defaultOpen = true }: { title: string; hidden: boolean; onToggleHidden: () => void; onUp?: () => void; onDown?: () => void; disabled: boolean; children: React.ReactNode; count?: number; defaultOpen?: boolean }) {
  const t = useTranslations("workspace.editor");
  const [open, setOpen] = React.useState(defaultOpen);
  const id = React.useId();
  return (
    <section className={cn("rounded-[14px] border border-border bg-surface", hidden && "bg-surface-muted/60")} aria-labelledby={`${id}-h`}>
      <div className="flex items-center gap-1 px-3 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`${id}-b`} className="flex min-h-11 flex-1 items-center gap-2 rounded-[8px] px-1 text-left">
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden="true" />
          <h3 id={`${id}-h`} className={cn("text-[15px] font-bold", hidden && "text-muted-foreground line-through decoration-1")}>
            {title}
          </h3>
          {count !== undefined ? <span className="text-xs font-semibold text-muted-foreground tabular">{count}</span> : null}
        </button>
        {!disabled ? (
          <>
            {onUp ? (
              <button type="button" onClick={onUp} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-surface-muted" aria-label={t("sectionUp", { section: title })}>
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            {onDown ? (
              <button type="button" onClick={onDown} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-surface-muted" aria-label={t("sectionDown", { section: title })}>
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" onClick={onToggleHidden} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-surface-muted" aria-label={hidden ? t("showSection", { section: title }) : t("hideSection", { section: title })} aria-pressed={hidden}>
              {hidden ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </>
        ) : null}
      </div>
      {open ? (
        <div id={`${id}-b`} className="border-t border-border px-3 pb-3 pt-2">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function ResumeEditor({ value, master, style, locked, issues, onChange, ai }: Props) {
  const t = useTranslations("workspace.editor");
  const ta = useTranslations("workspace.editor.ai");
  const [summaryPending, setSummaryPending] = React.useState<Pending | null>(null);
  const rewriteSummary = async () => {
    if (!ai) return;
    setSummaryPending({ mode: "summary", loading: true });
    const r = await ai.request({ mode: "summary", target: { kind: "summary" } });
    if ("error" in r) {
      setSummaryPending(null);
      toast.error(r.error);
      return;
    }
    setSummaryPending({ mode: "summary", loading: false, suggestion: r.suggestion });
  };
  const hidden = new Set(value.meta?.hiddenSections ?? []);
  const order = React.useMemo(() => {
    const wanted = [...(value.meta?.sectionOrder ?? []), ...style.sectionOrder, ...SECTION_KEYS].filter((s): s is SectionKey => (SECTION_KEYS as readonly string[]).includes(s));
    return [...new Set(wanted)].filter((s) => sectionHasContent(master, value, s));
  }, [value, master, style.sectionOrder]);

  const setMeta = (patch: Partial<ResumeData["meta"]>) => onChange({ ...value, meta: { hiddenSections: value.meta?.hiddenSections ?? [], sectionOrder: value.meta?.sectionOrder, ...patch } });
  const toggleHidden = (s: SectionKey) => setMeta({ hiddenSections: hidden.has(s) ? [...hidden].filter((x) => x !== s) : [...hidden, s] });
  const moveSection = (i: number, d: -1 | 1) => setMeta({ sectionOrder: move(order, i, i + d) });

  const skillIssue = (s: string) => issues.find((x) => x.code === "unknown_skill" && x.actual?.toLowerCase() === s.trim().toLowerCase());
  const removedExperience = master.experience.filter((m) => !value.experience.some((e) => e.id === m.id));

  const profileSkills = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const g of master.skills) for (const s of g.items) m.set(s.toLowerCase(), s);
    for (const e of master.experience) for (const s of e.technologies ?? []) m.set(s.toLowerCase(), s);
    return [...m.values()];
  }, [master]);
  const usedSkills = new Set(value.skills.flatMap((g) => g.items.map((s) => s.toLowerCase())));
  const addableSkills = profileSkills.filter((s) => !usedSkills.has(s.toLowerCase()));

  const render = (s: SectionKey, i: number) => {
    const common = {
      title: sectionHeading(s, style),
      hidden: hidden.has(s),
      onToggleHidden: () => toggleHidden(s),
      onUp: i > 0 ? () => moveSection(i, -1) : undefined,
      onDown: i < order.length - 1 ? () => moveSection(i, 1) : undefined,
      disabled: locked,
    };
    switch (s) {
      case "summary":
        return (
          <SectionCard key={s} {...common}>
            <AutoTextarea aria-label={sectionHeading("summary", style)} value={value.summary ?? ""} maxLength={800} disabled={locked} onChange={(e) => onChange({ ...value, summary: e.target.value })} className="border-border" />
            <div className="mt-1 flex items-center justify-between gap-2">
              {ai && !locked ? (
                <button type="button" className="inline-flex h-9 items-center gap-1 rounded-[8px] px-2 text-[12px] font-semibold text-primary hover:bg-accent disabled:opacity-40" disabled={Boolean(summaryPending?.loading)} onClick={() => void rewriteSummary()}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  {ta("rewriteSummary")}
                </button>
              ) : (
                <span />
              )}
              <p className="text-right text-xs text-muted-foreground tabular">{(value.summary ?? "").length} / 800</p>
            </div>
            {summaryPending ? (
              <SuggestionPanel
                pending={summaryPending}
                label={sectionHeading("summary", style)}
                onAccept={() => {
                  if (!summaryPending.loading) onChange({ ...value, summary: summaryPending.suggestion.after });
                  setSummaryPending(null);
                }}
                onReject={() => setSummaryPending(null)}
              />
            ) : null}
          </SectionCard>
        );
      case "skills":
        return (
          <SectionCard key={s} {...common} count={value.skills.reduce((n, g) => n + g.items.length, 0)}>
            <div className="flex flex-col gap-3">
              {value.skills.map((g, gi) => (
                <div key={gi}>
                  <input
                    aria-label={t("skillGroupName")}
                    value={g.group}
                    disabled={locked}
                    onChange={(e) => onChange({ ...value, skills: value.skills.map((x, k) => (k === gi ? { ...x, group: e.target.value } : x)) })}
                    className="mb-1.5 w-full rounded-[8px] border border-transparent bg-transparent px-2 py-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground hover:border-border focus:border-primary focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {g.items.map((sk, si) => {
                      const bad = skillIssue(sk);
                      return (
                        <span key={`${sk}-${si}`} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium", bad ? "border-danger/40 bg-[#FCEAE8] text-[#A82A21]" : "border-border bg-surface-muted")} title={bad?.message}>
                          {sk}
                          {!locked ? (
                            <button type="button" aria-label={t("removeSkill", { skill: sk })} className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/5" onClick={() => onChange({ ...value, skills: value.skills.map((x, k) => (k === gi ? { ...x, items: x.items.filter((_, j) => j !== si) } : x)).filter((x) => x.items.length || x.group) })}>
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          ) : null}
                        </span>
                      );
                    })}
                    {!locked && addableSkills.length ? (
                      <select
                        aria-label={t("addSkill")}
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          onChange({ ...value, skills: value.skills.map((x, k) => (k === gi ? { ...x, items: [...x.items, e.target.value] } : x)) });
                        }}
                        className="h-8 rounded-full border border-dashed border-border-strong bg-transparent px-2.5 text-[13px] text-muted-foreground"
                      >
                        <option value="">{t("addSkillFromProfile")}</option>
                        {addableSkills.map((sk) => (
                          <option key={sk} value={sk}>
                            {sk}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>
              ))}
              {!locked ? <p className="px-1 text-xs text-muted-foreground">{t("skillsHint")}</p> : null}
            </div>
          </SectionCard>
        );
      case "experience":
        return (
          <SectionCard key={s} {...common} count={value.experience.length}>
            <div className="flex flex-col gap-4">
              {value.experience.map((e, ei) => {
                const expIssues = issues.filter((x) => x.path.startsWith(`experience.${ei}`) && x.severity === "error");
                return (
                  <div key={e.id} className={cn("rounded-[12px] border border-border p-2.5", expIssues.length && "border-danger/50")}>
                    <div className="flex items-start justify-between gap-2 px-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[14px] font-bold">
                          {e.title}
                          <Lock className="h-3.5 w-3.5 text-subtle-foreground" aria-label={t("factsLocked")} />
                        </p>
                        <p className="text-[13px] text-muted-foreground">
                          {e.company} · {dateRange(e.startDate, e.endDate, style)}
                        </p>
                      </div>
                      {!locked ? (
                        <div className="flex shrink-0">
                          <button type="button" aria-label={t("moveUp", { n: ei + 1 })} disabled={ei === 0} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-surface-muted disabled:opacity-30" onClick={() => onChange({ ...value, experience: move(value.experience, ei, ei - 1) })}>
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button type="button" aria-label={t("moveDown", { n: ei + 1 })} disabled={ei === value.experience.length - 1} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-surface-muted disabled:opacity-30" onClick={() => onChange({ ...value, experience: move(value.experience, ei, ei + 1) })}>
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button type="button" aria-label={t("removeRole", { role: `${e.title}, ${e.company}` })} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-[#FCEAE8] hover:text-danger" onClick={() => onChange({ ...value, experience: value.experience.filter((x) => x.id !== e.id) })}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {expIssues.map((x, k) => (
                      <p key={k} role="alert" className="mx-2 mt-1 text-xs font-medium text-danger">
                        {x.message}
                      </p>
                    ))}
                    <div className="mt-1.5">
                      <SortableBullets
                        items={e.bullets}
                        disabled={locked}
                        labelFor={(bi) => t("bulletLabel", { n: bi + 1, role: e.title })}
                        itemIssue={(bi) => issues.find((x) => x.path === `experience.${ei}.bullets.${bi}`)?.message}
                        onChange={(bullets) => onChange({ ...value, experience: value.experience.map((x) => (x.id === e.id ? { ...x, bullets } : x)) })}
                        ai={ai ? { request: (bulletId, mode) => ai.request({ mode, target: { kind: "bullet", experienceId: e.id, bulletId } }) } : null}
                      />
                      {!locked ? (
                        <div className="mt-1 flex flex-wrap gap-1 px-1">
                          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, experience: value.experience.map((x) => (x.id === e.id ? { ...x, bullets: [...x.bullets, { id: `${e.id}_n${Date.now().toString(36)}`, text: "" }] } : x)) })}>
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            {t("addBullet")}
                          </Button>
                          {(() => {
                            const m = master.experience.find((x) => x.id === e.id);
                            const missing = m?.bullets.filter((mb) => !e.bullets.some((b) => b.id === mb.id)) ?? [];
                            return missing.length ? (
                              <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, experience: value.experience.map((x) => (x.id === e.id ? { ...x, bullets: [...x.bullets, ...missing] } : x)) })}>
                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                {t("restoreBullets", { n: missing.length })}
                              </Button>
                            ) : null;
                          })()}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {!locked && removedExperience.length ? (
                <div className="rounded-[12px] border border-dashed border-border-strong p-3">
                  <p className="text-[13px] font-semibold text-muted-foreground">{t("removedRoles")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {removedExperience.map((m) => (
                      <Button key={m.id} type="button" variant="outline" size="sm" onClick={() => onChange({ ...value, experience: [...value.experience, m].sort((a, b) => master.experience.findIndex((x) => x.id === a.id) - master.experience.findIndex((x) => x.id === b.id)) })}>
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        {m.title}, {m.company}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </SectionCard>
        );
      case "projects":
        return (
          <SectionCard key={s} {...common} count={value.projects.length} defaultOpen={false}>
            <div className="flex flex-col gap-3">
              {value.projects.map((p, pi) => (
                <div key={p.id} className="rounded-[12px] border border-border p-2.5">
                  <div className="flex items-start justify-between px-2">
                    <p className="text-[14px] font-bold">{p.name}</p>
                    {!locked ? (
                      <button type="button" aria-label={t("removeItem", { item: p.name })} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-[#FCEAE8] hover:text-danger" onClick={() => onChange({ ...value, projects: value.projects.filter((_, k) => k !== pi) })}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  <AutoTextarea aria-label={t("projectDescription", { item: p.name })} value={p.description} disabled={locked} onChange={(e) => onChange({ ...value, projects: value.projects.map((x, k) => (k === pi ? { ...x, description: e.target.value } : x)) })} />
                  <SortableBullets
                    items={p.bullets.map((text, k) => ({ id: `${p.id}_${k}`, text }))}
                    disabled={locked}
                    labelFor={(bi) => t("bulletLabel", { n: bi + 1, role: p.name })}
                    onChange={(items) => onChange({ ...value, projects: value.projects.map((x, k) => (k === pi ? { ...x, bullets: items.map((b) => b.text) } : x)) })}
                  />
                </div>
              ))}
              <RestoreList
                locked={locked}
                label={t("removedItems")}
                items={master.projects.filter((m) => !value.projects.some((p) => p.name === m.name)).map((m) => ({ key: m.id, label: m.name, add: () => onChange({ ...value, projects: [...value.projects, m] }) }))}
              />
            </div>
          </SectionCard>
        );
      case "education":
        return (
          <SectionCard key={s} {...common} count={value.education.length}>
            <ToggleList
              locked={locked}
              items={master.education.map((m) => ({ key: m.id, label: `${[m.degree, m.field].filter(Boolean).join(", ")} — ${m.institution}`, on: value.education.some((e) => e.id === m.id) }))}
              onToggle={(key, on) => onChange({ ...value, education: on ? master.education.filter((m) => m.id === key || value.education.some((e) => e.id === m.id)) : value.education.filter((e) => e.id !== key) })}
            />
          </SectionCard>
        );
      case "certifications":
        return (
          <SectionCard key={s} {...common} count={value.certifications.length}>
            <ToggleList
              locked={locked}
              items={master.certifications.map((m) => ({ key: m.name, label: [m.name, m.issuer].filter(Boolean).join(", "), on: value.certifications.some((c) => c.name === m.name) }))}
              onToggle={(key, on) => onChange({ ...value, certifications: on ? master.certifications.filter((m) => m.name === key || value.certifications.some((c) => c.name === m.name)) : value.certifications.filter((c) => c.name !== key) })}
            />
          </SectionCard>
        );
      case "awards":
        return (
          <SectionCard key={s} {...common} count={value.awards.length} defaultOpen={false}>
            <ToggleList locked={locked} items={master.awards.map((a) => ({ key: a, label: a, on: value.awards.includes(a) }))} onToggle={(key, on) => onChange({ ...value, awards: on ? master.awards.filter((a) => a === key || value.awards.includes(a)) : value.awards.filter((a) => a !== key) })} />
          </SectionCard>
        );
      case "languages":
        return (
          <SectionCard key={s} {...common} count={value.languages.length} defaultOpen={false}>
            <ToggleList locked={locked} items={master.languages.map((l) => ({ key: l.name, label: `${l.name} (${l.level})`, on: value.languages.some((x) => x.name === l.name) }))} onToggle={(key, on) => onChange({ ...value, languages: on ? master.languages.filter((l) => l.name === key || value.languages.some((x) => x.name === l.name)) : value.languages.filter((l) => l.name !== key) })} />
          </SectionCard>
        );
    }
  };

  return <div className="flex flex-col gap-2.5">{order.map(render)}</div>;
}

function ToggleList({ items, locked, onToggle }: { items: { key: string; label: string; on: boolean }[]; locked: boolean; onToggle: (key: string, on: boolean) => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it) => (
        <li key={it.key}>
          <label className={cn("flex min-h-11 items-center gap-3 rounded-[8px] px-2 text-[14px]", !locked && "cursor-pointer hover:bg-surface-muted")}>
            <input type="checkbox" className="h-[18px] w-[18px] accent-[var(--primary)]" checked={it.on} disabled={locked} onChange={(e) => onToggle(it.key, e.target.checked)} />
            <span className={cn(!it.on && "text-muted-foreground line-through")}>{it.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function RestoreList({ items, locked, label }: { items: { key: string; label: string; add: () => void }[]; locked: boolean; label: string }) {
  if (locked || !items.length) return null;
  return (
    <div className="rounded-[12px] border border-dashed border-border-strong p-3">
      <p className="text-[13px] font-semibold text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((it) => (
          <Button key={it.key} type="button" variant="outline" size="sm" onClick={it.add}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {it.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function sectionHasContent(master: ResumeData, value: ResumeData, s: SectionKey) {
  switch (s) {
    case "summary":
      return Boolean(master.summary || value.summary);
    case "skills":
      return master.skills.length > 0 || value.skills.length > 0;
    case "experience":
      return master.experience.length > 0;
    case "projects":
      return master.projects.length > 0;
    case "education":
      return master.education.length > 0;
    case "certifications":
      return master.certifications.length > 0;
    case "awards":
      return master.awards.length > 0;
    case "languages":
      return master.languages.length > 0;
  }
}
