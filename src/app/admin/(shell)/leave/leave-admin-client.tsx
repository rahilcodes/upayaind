"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { useServerAction } from "@/components/portal/action-form";
import { addHolidayAction, applyCoverAction, coverPlanAction, decideLeaveAction, deleteHolidayAction, saveLeaveTypeAction } from "./actions";

type PlanResult = Awaited<ReturnType<typeof coverPlanAction>>;
type Plan = Extract<PlanResult, { ok: true }>["data"];
type Candidate = Plan["candidates"][number];
type CoverMap = Record<string, string>; // studentId → employeeId ("" = no cover)

const NONE = "";

/** "Divya Menon · UPY-0012 · 5/8 (other market)" — the suffix when the candidate doesn't serve the market in question. */
function candidateLabel(c: Candidate, suffix: string | null) {
  return `${c.name} · ${c.code} · ${c.load}/${c.max}${suffix ? ` (${suffix})` : ""}`;
}

/** Summary "Divya (2), Rahul (1)" for the chosen plan. */
function summarise(plan: Plan, covers: CoverMap) {
  const counts = new Map<string, number>();
  for (const s of plan.students) {
    const c = covers[s.studentId];
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${plan.candidates.find((c) => c.employeeId === id)?.name ?? "?"} (${n})`)
    .join(", ");
}

function toEntries(plan: Plan, covers: CoverMap) {
  return plan.students.filter((s) => covers[s.studentId]).map((s) => ({ studentId: s.studentId, coverEmployeeId: covers[s.studentId]! }));
}

/** Loads the plan when the dialog opens; keeps per-applicant choices. */
function useCoverPlan(leaveRequestId: string, open: boolean) {
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [covers, setCovers] = React.useState<CoverMap>({});
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    void coverPlanAction(leaveRequestId).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (!r.ok) return setError(r.error);
      setPlan(r.data);
      setCovers(Object.fromEntries(r.data.students.map((s) => [s.studentId, s.suggestedCoverId ?? NONE])));
    });
    return () => {
      alive = false;
    };
  }, [leaveRequestId, open]);
  const reset = () => {
    setPlan(null);
    setCovers({});
    setError(null);
  };
  return { plan, covers, setCovers, loading, error, reset };
}

/**
 * "Cover while away" table: one row per applicant with a candidate select
 * (pre-filled with the suggestion), an "Assign all to…" shortcut and a summary.
 * Stacks into cards below 640px.
 */
function CoverPlanner({ id, plan, covers, setCovers, loading, error }: { id: string; plan: Plan | null; covers: CoverMap; setCovers: React.Dispatch<React.SetStateAction<CoverMap>>; loading: boolean; error: string | null }) {
  const t = useTranslations("work.adminLeave.decide");
  if (loading && !plan) return <p role="status" className="text-sm text-muted-foreground">{t("coverLoading")}</p>;
  if (error) return <p role="alert" className="text-sm font-semibold text-danger">{error}</p>;
  if (!plan) return null;
  if (plan.students.length === 0) return <p className="text-sm text-muted-foreground">{t("coverNone")}</p>;
  const assigned = plan.students.filter((s) => covers[s.studentId]).length;
  const unassigned = plan.students.length - assigned;
  const summary = summarise(plan, covers);
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-semibold">{t("coverHeading", { from: plan.window.label })}</legend>
      {plan.candidates.length === 0 ? <p className="text-sm text-muted-foreground">{t("noCandidates")}</p> : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor={`all-${id}`} className="text-sm font-medium text-muted-foreground">{t("assignAll")}</label>
          <Select
            id={`all-${id}`}
            className="sm:max-w-xs"
            value="__pick"
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__pick") return;
              setCovers(Object.fromEntries(plan.students.map((s) => [s.studentId, v === "__none" ? NONE : v])));
            }}
          >
            <option value="__pick">{t("assignAllPick")}</option>
            <option value="__none">{t("noCover")}</option>
            {plan.candidates.map((c) => <option key={c.employeeId} value={c.employeeId}>{candidateLabel(c, c.sameMarket ? null : t("otherMarket"))}</option>)}
          </Select>
        </div>
      )}
      <ul className="divide-y divide-border rounded-[12px] border border-border" aria-label={t("coverHeading", { from: plan.window.label })}>
        {plan.students.map((s) => (
          <li key={s.studentId} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] sm:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {s.name} <Badge tone="grey" className="ml-1 align-middle">{s.marketCode}</Badge>
              </p>
              <p className="truncate text-[13px] text-muted-foreground">{s.targetTitles[0] ?? t("noTitle")}</p>
            </div>
            <Select aria-label={t("coverFor", { name: s.name })} value={covers[s.studentId] ?? NONE} onChange={(e) => setCovers((m) => ({ ...m, [s.studentId]: e.target.value }))}>
              <option value={NONE}>{t("noCover")}</option>
              {plan.candidates.map((c) => (
                <option key={c.employeeId} value={c.employeeId}>
                  {candidateLabel(c, c.marketIds.includes(s.marketId) ? null : t("otherMarket"))}
                </option>
              ))}
            </Select>
          </li>
        ))}
      </ul>
      <p role="status" className="text-sm">
        {assigned > 0 ? <span className="font-semibold">{t("summary", { count: assigned, list: summary })}</span> : <span className="text-muted-foreground">{t("summaryNone")}</span>}
        {unassigned > 0 ? <span className="block text-[13px] text-[#7A4E0E]">{t("unassigned", { count: unassigned })}</span> : null}
      </p>
    </fieldset>
  );
}

/** Approve (with the cover plan in the same step) or reject with a comment (F9 → F2, D-144). */
export function DecideButtons({ id, employeeName, students }: { id: string; employeeName: string; students: number }) {
  const t = useTranslations("work.adminLeave.decide");
  const [open, setOpen] = React.useState<null | "APPROVED" | "REJECTED">(null);
  const [note, setNote] = React.useState("");
  const [withoutCover, setWithoutCover] = React.useState(false);
  const cp = useCoverPlan(id, open === "APPROVED" && students > 0);
  const close = () => {
    setOpen(null);
    setNote("");
    setWithoutCover(false);
    cp.reset();
  };
  const decide = useServerAction(decideLeaveAction, { onSuccess: close });
  const unassigned = cp.plan ? cp.plan.students.filter((s) => !cp.covers[s.studentId]).length : 0;
  const approveBlocked = open === "APPROVED" && students > 0 && (cp.loading || (!cp.error && cp.plan === null) || (unassigned > 0 && !withoutCover));
  return (
    <Dialog open={open !== null} onOpenChange={(o) => (!o ? close() : undefined)}>
      <div className="flex flex-wrap gap-2">
        <DialogTrigger asChild>
          <Button size="sm" variant="success" onClick={() => setOpen("APPROVED")}><Check className="h-4 w-4" aria-hidden="true" />{t("approve")}</Button>
        </DialogTrigger>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" onClick={() => setOpen("REJECTED")}><X className="h-4 w-4" aria-hidden="true" />{t("reject")}</Button>
        </DialogTrigger>
      </div>
      <DialogContent wide={open === "APPROVED"} title={open === "APPROVED" ? t("approveTitle", { name: employeeName }) : t("rejectTitle", { name: employeeName })} description={open === "APPROVED" && students > 0 ? t("coverDescription", { count: students }) : undefined}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!open) return;
            const covers = open === "APPROVED" && cp.plan ? toEntries(cp.plan, cp.covers) : undefined;
            void decide.run(id, open, note, covers);
          }}
        >
          <Field id={`n-${id}`} label={open === "REJECTED" ? t("noteRequired") : t("noteOptional")} error={decide.fieldErrors.note}>
            <Textarea {...fieldA11y(`n-${id}`, decide.fieldErrors.note)} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} required={open === "REJECTED"} />
          </Field>
          {open === "APPROVED" && students > 0 ? (
            <>
              <CoverPlanner id={id} plan={cp.plan} covers={cp.covers} setCovers={cp.setCovers} loading={cp.loading} error={cp.error} />
              {unassigned > 0 ? (
                <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                  <Checkbox checked={withoutCover} onChange={(e) => setWithoutCover(e.target.checked)} />
                  {t("approveWithoutCover", { count: unassigned })}
                </label>
              ) : null}
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>{t("cancel")}</Button>
            <Button type="submit" variant={open === "APPROVED" ? "success" : "danger"} loading={decide.pending} disabled={approveBlocked}>
              {open === "APPROVED" ? (students > 0 && cp.plan?.students.length ? t("approveAndCover") : t("approve")) : t("reject")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Set or change the per-applicant cover of an already-approved request. */
export function ChangeCoverButton({ id, employeeName, hasCover }: { id: string; employeeName: string; hasCover: boolean }) {
  const t = useTranslations("work.adminLeave.decide");
  const [open, setOpen] = React.useState(false);
  const cp = useCoverPlan(id, open);
  const close = () => {
    setOpen(false);
    cp.reset();
  };
  const save = useServerAction(applyCoverAction, { onSuccess: close });
  const unassigned = cp.plan ? cp.plan.students.filter((s) => !cp.covers[s.studentId]).length : 0;
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><UserPlus className="h-4 w-4" aria-hidden="true" />{hasCover ? t("changeCover") : t("setCover")}</Button>
      </DialogTrigger>
      <DialogContent wide title={t("coverEditTitle", { name: employeeName })} description={cp.plan ? t("coverEditDescription", { dates: cp.plan.window.label }) : undefined}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (cp.plan) void save.run(id, toEntries(cp.plan, cp.covers));
          }}
        >
          <CoverPlanner id={`e-${id}`} plan={cp.plan} covers={cp.covers} setCovers={cp.setCovers} loading={cp.loading} error={cp.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>{t("cancel")}</Button>
            <Button type="submit" loading={save.pending} disabled={!cp.plan || cp.plan.students.length === 0}>
              {t("saveCover")}{unassigned > 0 && cp.plan?.students.length ? ` (${t("unassignedShort", { count: unassigned })})` : ""}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type LeaveTypeRow = { id: string; name: string; annualQuota: number; paid: boolean; carryForward: boolean; isActive: boolean };

export function LeaveTypeDialog({ type }: { type?: LeaveTypeRow }) {
  const t = useTranslations("work.adminLeave.types");
  const [open, setOpen] = React.useState(false);
  const { run, pending, fieldErrors } = useServerAction(saveLeaveTypeAction, { onSuccess: () => setOpen(false) });
  const id = type?.id ?? "new";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {type ? <Button size="sm" variant="ghost" aria-label={t("editLabel", { name: type.name })}><Pencil className="h-4 w-4" aria-hidden="true" /></Button> : <Button size="sm" variant="outline"><Plus className="h-4 w-4" aria-hidden="true" />{t("add")}</Button>}
      </DialogTrigger>
      <DialogContent title={type ? t("editTitle") : t("addTitle")}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run({ id: type?.id ?? null, name: String(fd.get("name") ?? ""), annualQuota: Number(fd.get("annualQuota") ?? 0), paid: fd.get("paid") === "on", carryForward: fd.get("carryForward") === "on", isActive: fd.get("isActive") === "on" });
          }}
        >
          <Field id={`lt-name-${id}`} label={t("name")} error={fieldErrors.name}>
            <Input {...fieldA11y(`lt-name-${id}`, fieldErrors.name)} name="name" defaultValue={type?.name} maxLength={40} required />
          </Field>
          <Field id={`lt-q-${id}`} label={t("quota")} hint={t("quotaHint")} error={fieldErrors.annualQuota}>
            <Input {...fieldA11y(`lt-q-${id}`, fieldErrors.annualQuota, true)} name="annualQuota" type="number" min={0} max={365} step={0.5} defaultValue={type?.annualQuota ?? 0} required />
          </Field>
          {[["paid", t("paid"), type?.paid ?? true], ["carryForward", t("carry"), type?.carryForward ?? false], ["isActive", t("active"), type?.isActive ?? true]].map(([n, l, v]) => (
            <label key={String(n)} className="flex min-h-11 items-center gap-3 text-sm font-medium">
              <Checkbox name={String(n)} defaultChecked={Boolean(v)} />
              {String(l)}
            </label>
          ))}
          <div className="flex justify-end"><Button type="submit" loading={pending}>{t("save")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function HolidayForm({ regions, year }: { regions: string[]; year: number }) {
  const t = useTranslations("work.adminLeave.holidays");
  const ref = React.useRef<HTMLFormElement>(null);
  const { run, pending, fieldErrors } = useServerAction(addHolidayAction, { onSuccess: () => ref.current?.reset() });
  return (
    <form
      ref={ref}
      className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void run({ date: String(fd.get("date") ?? ""), name: String(fd.get("name") ?? ""), region: String(fd.get("region") ?? "") });
      }}
    >
      <Field id="h-date" label={t("date")} error={fieldErrors.date}>
        <Input {...fieldA11y("h-date", fieldErrors.date)} name="date" type="date" min={`${year - 1}-01-01`} required />
      </Field>
      <Field id="h-name" label={t("name")} error={fieldErrors.name}>
        <Input {...fieldA11y("h-name", fieldErrors.name)} name="name" maxLength={80} required />
      </Field>
      <Field id="h-region" label={t("region")} error={fieldErrors.region}>
        <Input {...fieldA11y("h-region", fieldErrors.region)} name="region" list="h-regions" defaultValue="IN" maxLength={8} className="uppercase" required />
        <datalist id="h-regions">{regions.map((r) => <option key={r} value={r} />)}</datalist>
      </Field>
      <Button type="submit" loading={pending}><Plus className="h-4 w-4" aria-hidden="true" />{t("add")}</Button>
    </form>
  );
}

export function DeleteHolidayButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("work.adminLeave.holidays");
  const { run, pending } = useServerAction(deleteHolidayAction);
  return (
    <Button size="icon-sm" variant="ghost" loading={pending} onClick={() => { if (window.confirm(t("confirmDelete", { name }))) void run(id); }} aria-label={t("delete", { name })}>
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
