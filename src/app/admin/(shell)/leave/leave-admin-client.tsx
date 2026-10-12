"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { useServerAction } from "@/components/portal/action-form";
import { addHolidayAction, decideLeaveAction, deleteHolidayAction, saveLeaveTypeAction, setCoverAction } from "./actions";

type Candidate = { id: string; name: string; code: string; load: number; max: number; sameMarket: boolean };

/** Approve / reject with comment; after approval, prompt for cover (F9 → F2). */
export function DecideButtons({ id, employeeName, students, candidates }: { id: string; employeeName: string; students: number; candidates: Candidate[] }) {
  const t = useTranslations("work.adminLeave.decide");
  const router = useRouter();
  const [open, setOpen] = React.useState<null | "APPROVED" | "REJECTED">(null);
  const [step, setStep] = React.useState<"decide" | "cover">("decide");
  const [note, setNote] = React.useState("");
  const [cover, setCover] = React.useState("");
  const decide = useServerAction(decideLeaveAction, {
    refresh: false,
    onSuccess: (d) => {
      const r = d as { status: string };
      if (r.status === "APPROVED" && students > 0 && candidates.length) setStep("cover");
      else close(true);
    },
  });
  const cov = useServerAction(setCoverAction, { onSuccess: () => close(false) });
  const close = (refresh: boolean) => {
    setOpen(null);
    setStep("decide");
    setNote("");
    setCover("");
    if (refresh) router.refresh();
  };
  return (
    <Dialog open={open !== null} onOpenChange={(o) => (!o ? close(step === "cover") : undefined)}>
      <div className="flex flex-wrap gap-2">
        <DialogTrigger asChild>
          <Button size="sm" variant="success" onClick={() => setOpen("APPROVED")}><Check className="h-4 w-4" aria-hidden="true" />{t("approve")}</Button>
        </DialogTrigger>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" onClick={() => setOpen("REJECTED")}><X className="h-4 w-4" aria-hidden="true" />{t("reject")}</Button>
        </DialogTrigger>
      </div>
      <DialogContent
        title={step === "cover" ? t("coverTitle", { name: employeeName }) : open === "APPROVED" ? t("approveTitle", { name: employeeName }) : t("rejectTitle", { name: employeeName })}
        description={step === "cover" ? t("coverDescription", { count: students }) : undefined}
      >
        {step === "decide" ? (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (open) void decide.run(id, open, note);
            }}
          >
            <Field id={`n-${id}`} label={open === "REJECTED" ? t("noteRequired") : t("noteOptional")} error={decide.fieldErrors.note}>
              <Textarea {...fieldA11y(`n-${id}`, decide.fieldErrors.note)} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} required={open === "REJECTED"} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => close(false)}>{t("cancel")}</Button>
              <Button type="submit" variant={open === "APPROVED" ? "success" : "danger"} loading={decide.pending}>{open === "APPROVED" ? t("approve") : t("reject")}</Button>
            </div>
          </form>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void cov.run(id, cover);
            }}
          >
            <Field id={`c-${id}`} label={t("coverLabel")} error={cov.fieldErrors.cover}>
              <Select {...fieldA11y(`c-${id}`, cov.fieldErrors.cover)} value={cover} onChange={(e) => setCover(e.target.value)} required>
                <option value="">{t("coverPick")}</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code}) · {c.load}/{c.max}{c.sameMarket ? "" : ` · ${t("otherMarket")}`}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => close(true)}>{t("skip")}</Button>
              <Button type="submit" loading={cov.pending} disabled={!cover}><UserPlus className="h-4 w-4" aria-hidden="true" />{t("setCover")}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Set cover later for an already-approved request. */
export function CoverButton({ id, candidates }: { id: string; candidates: Candidate[] }) {
  const t = useTranslations("work.adminLeave.decide");
  const [open, setOpen] = React.useState(false);
  const [cover, setCover] = React.useState("");
  const cov = useServerAction(setCoverAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><UserPlus className="h-4 w-4" aria-hidden="true" />{t("setCover")}</Button>
      </DialogTrigger>
      <DialogContent title={t("setCover")}>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void cov.run(id, cover); }}>
          <Field id={`cl-${id}`} label={t("coverLabel")}>
            <Select id={`cl-${id}`} value={cover} onChange={(e) => setCover(e.target.value)} required>
              <option value="">{t("coverPick")}</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code}) · {c.load}/{c.max}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end"><Button type="submit" loading={cov.pending} disabled={!cover}>{t("setCover")}</Button></div>
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
