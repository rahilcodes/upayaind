"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus, ClipboardCheck, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { RichTextEditor } from "../cms/rich-text";
import { createSlotsAction, deletePrepAction, deleteSlotAction, publishPrepAction, recordOutcomeAction, savePrepAction, uploadPrepFileAction } from "./actions";

const TYPES = ["VIDEO", "ARTICLE", "PDF", "QUESTION_BANK", "LINK"] as const;
type PrepType = (typeof TYPES)[number];

export type PrepValue = { id?: string; title: string; type: PrepType; tags: string[]; marketCodes: string[]; url: string | null; fileKey: string | null; fileName: string | null; body: unknown; isPublished: boolean };

const BLANK: PrepValue = { title: "", type: "ARTICLE", tags: [], marketCodes: [], url: "", fileKey: null, fileName: null, body: null, isPublished: false };

export function PrepDialog({ value, markets }: { value?: PrepValue; markets: { code: string; name: string }[] }) {
  const t = useTranslations("admin.prep");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<PrepValue>(value ?? BLANK);
  const [tags, setTags] = React.useState((value?.tags ?? []).join(", "));
  const [uploading, startUpload] = React.useTransition();
  const [uploadErr, setUploadErr] = React.useState<string | null>(null);
  const { run, pending, fieldErrors } = useServerAction(savePrepAction, { onSuccess: () => setOpen(false) });
  const set = <K extends keyof PrepValue>(k: K, val: PrepValue[K]) => setV((cur) => ({ ...cur, [k]: val }));
  const pre = value?.id ?? "new";
  const needsUrl = v.type === "VIDEO" || v.type === "LINK";

  function upload(file: File | undefined) {
    if (!file) return;
    setUploadErr(null);
    const fd = new FormData();
    fd.set("file", file);
    startUpload(async () => {
      const r = await uploadPrepFileAction(fd);
      if (r.ok) setV((cur) => ({ ...cur, fileKey: r.data.key, fileName: r.data.filename ?? file.name }));
      else setUploadErr(r.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(value ?? BLANK);
          setTags((value?.tags ?? []).join(", "));
          setUploadErr(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {value ? (
          <Button variant="outline" size="sm" aria-label={`${tc("edit")}: ${value.title}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {tc("edit")}
          </Button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("newResource")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent wide className="max-w-3xl" title={value ? t("editTitle") : t("newTitle")}>
        <form
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run({
              id: v.id,
              title: v.title,
              type: v.type,
              tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
              marketCodes: v.marketCodes,
              url: v.url || null,
              fileKey: v.fileKey,
              body: v.body,
              isPublished: v.isPublished,
            });
          }}
        >
          <Field id={`${pre}-title`} label={t("resourceTitle")} error={fieldErrors.title} className="sm:col-span-2">
            <Input {...fieldA11y(`${pre}-title`, fieldErrors.title)} value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={160} />
          </Field>
          <Field id={`${pre}-type`} label={t("type")}>
            <Select id={`${pre}-type`} value={v.type} onChange={(e) => set("type", e.target.value as PrepType)}>
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`types.${x}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={`${pre}-tags`} label={t("tags")} hint={t("tagsHint")} error={fieldErrors.tags}>
            <Input {...fieldA11y(`${pre}-tags`, fieldErrors.tags, true)} value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-semibold">{t("markets")}</legend>
            <p className="mb-1 text-[13px] text-muted-foreground">{t("marketsHint")}</p>
            <div className="flex flex-wrap gap-x-5">
              {markets.map((m) => (
                <label key={m.code} className="inline-flex min-h-11 items-center gap-2 text-sm">
                  <Checkbox checked={v.marketCodes.includes(m.code)} onChange={(e) => set("marketCodes", e.target.checked ? [...v.marketCodes, m.code] : v.marketCodes.filter((x) => x !== m.code))} />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Field id={`${pre}-url`} label={needsUrl ? t("url") : t("urlOptional")} hint={v.type === "VIDEO" ? t("videoHint") : undefined} error={fieldErrors.url} className="sm:col-span-2">
            <Input {...fieldA11y(`${pre}-url`, fieldErrors.url, v.type === "VIDEO")} type="url" value={v.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
          </Field>
          {v.type === "PDF" || v.fileKey ? (
            <div className="sm:col-span-2">
              <p className="mb-1 text-sm font-semibold">{t("file")}</p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] border-border-strong px-3 text-sm font-semibold hover:bg-surface-muted">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  {uploading ? t("uploading") : v.fileKey ? t("replaceFile") : t("uploadPdf")}
                  <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} disabled={uploading} />
                </label>
                {v.fileKey ? (
                  <span className="text-sm">
                    {v.fileName ?? t("fileAttached")}{" "}
                    <button type="button" className="min-h-11 font-semibold text-danger hover:underline" onClick={() => setV((c) => ({ ...c, fileKey: null, fileName: null }))}>
                      {t("removeFile")}
                    </button>
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("fileHint")}</p>
              {uploadErr || fieldErrors.fileKey ? (
                <p role="alert" className="mt-1 text-[13px] font-medium text-danger">
                  {uploadErr ?? fieldErrors.fileKey}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <p id={`${pre}-body-label`} className="mb-2 text-sm font-semibold">
              {t("body")}
            </p>
            <RichTextEditor value={v.body} onChange={(doc) => set("body", doc)} labelId={`${pre}-body-label`} invalid={Boolean(fieldErrors.body)} />
            {fieldErrors.body ? (
              <p role="alert" className="mt-1 text-[13px] font-medium text-danger">
                {fieldErrors.body}
              </p>
            ) : null}
          </div>
          <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium sm:col-span-2">
            <Checkbox checked={v.isPublished} onChange={(e) => set("isPublished", e.target.checked)} />
            {t("published")}
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending} disabled={uploading}>
              {tc("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PublishToggle({ id, isPublished, title }: { id: string; isPublished: boolean; title: string }) {
  const t = useTranslations("admin.prep");
  const { run, pending } = useServerAction(publishPrepAction);
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
      <Checkbox checked={isPublished} disabled={pending} onChange={(e) => run(id, e.target.checked)} aria-label={t("publishedFor", { title })} />
      {t("published")}
    </label>
  );
}

export function DeletePrepButton({ id, title }: { id: string; title: string }) {
  const t = useTranslations("admin.prep");
  const { run, pending } = useServerAction(deletePrepAction);
  return (
    <Button variant="ghost" size="icon-sm" loading={pending} aria-label={t("deleteFor", { title })} onClick={() => window.confirm(t("deleteConfirm", { title })) && run(id)}>
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}

export function SlotDialog({ staff, timezone }: { staff: { id: string; name: string; isCoach?: boolean }[]; timezone: string }) {
  const t = useTranslations("admin.prep");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const { run, pending, fieldErrors } = useServerAction(createSlotsAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          {t("newSlots")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("slotsTitle")} description={t("slotsDescription", { tz: timezone })}>
        <form
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const when = String(fd.get("when") ?? "");
            run({
              conductedById: String(fd.get("by") ?? ""),
              scheduledAt: when ? new Date(when).toISOString() : "",
              durationMin: Number(fd.get("duration") ?? 45),
              focus: String(fd.get("focus") ?? ""),
              meetingLink: String(fd.get("link") ?? ""),
              count: Number(fd.get("count") ?? 1),
            });
          }}
        >
          <Field id="slot-by" label={t("conductedBy")} error={fieldErrors.conductedById} className="sm:col-span-2">
            <Select {...fieldA11y("slot-by", fieldErrors.conductedById)} name="by" defaultValue="">
              <option value="" disabled>
                {t("pickStaff")}
              </option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.isCoach ? t("coachOption", { name: s.name }) : s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="slot-focus" label={t("focus")} error={fieldErrors.focus} className="sm:col-span-2">
            <Input {...fieldA11y("slot-focus", fieldErrors.focus)} name="focus" placeholder={t("focusPlaceholder")} maxLength={160} />
          </Field>
          <Field id="slot-when" label={t("firstSlot")} error={fieldErrors.scheduledAt}>
            <Input {...fieldA11y("slot-when", fieldErrors.scheduledAt)} name="when" type="datetime-local" />
          </Field>
          <Field id="slot-dur" label={t("duration")} error={fieldErrors.durationMin}>
            <Select id="slot-dur" name="duration" defaultValue="45">
              {[30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {t("minutes", { n: m })}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="slot-count" label={t("count")} hint={t("countHint")} error={fieldErrors.count}>
            <Input {...fieldA11y("slot-count", fieldErrors.count, true)} name="count" type="number" min={1} max={10} defaultValue={1} className="tabular" />
          </Field>
          <Field id="slot-link" label={t("meetingLink")} error={fieldErrors.meetingLink}>
            <Input {...fieldA11y("slot-link", fieldErrors.meetingLink)} name="link" type="url" placeholder="https://" />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {t("createSlots")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const SCORE_KEYS = ["communication", "technical", "structure", "confidence"] as const;

export function OutcomeDialog({ id, studentName, focus, booked }: { id: string; studentName: string | null; focus: string | null; booked: boolean }) {
  const t = useTranslations("admin.prep");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [outcome, setOutcome] = React.useState<"DONE" | "NO_SHOW" | "CANCELLED">(booked ? "DONE" : "CANCELLED");
  const [scores, setScores] = React.useState<Record<(typeof SCORE_KEYS)[number], number>>({ communication: 3, technical: 3, structure: 3, confidence: 3 });
  const [feedback, setFeedback] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(recordOutcomeAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t("recordFor", { name: studentName ?? focus ?? "" })}>
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          {booked ? t("record") : t("cancelSlot")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("recordTitle")} description={studentName ? `${studentName} · ${focus ?? ""}` : (focus ?? undefined)}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run({ id, outcome, scores: outcome === "DONE" ? scores : null, feedback: feedback || null });
          }}
        >
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t("outcome")}</legend>
            <div className="flex flex-wrap gap-x-5">
              {(booked ? (["DONE", "NO_SHOW", "CANCELLED"] as const) : (["CANCELLED"] as const)).map((o) => (
                <label key={o} className="inline-flex min-h-11 items-center gap-2 text-sm">
                  <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="h-[18px] w-[18px] accent-[var(--primary)]" />
                  {t(`outcomes.${o}`)}
                </label>
              ))}
            </div>
          </fieldset>
          {outcome === "DONE" ? (
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm font-semibold">{t("scorecard")}</legend>
              {SCORE_KEYS.map((k) => (
                <div key={k} className="flex flex-wrap items-center justify-between gap-2">
                  <span id={`sc-${id}-${k}`} className="text-sm">
                    {t(`scores.${k}`)}
                  </span>
                  <div role="radiogroup" aria-labelledby={`sc-${id}-${k}`} className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={scores[k] === n}
                        onClick={() => setScores((s) => ({ ...s, [k]: n }))}
                        className={`tabular h-11 w-11 rounded-[10px] border-[1.5px] text-sm font-semibold ${scores[k] === n ? "border-primary bg-primary text-primary-foreground" : "border-border-strong hover:bg-surface-muted"}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {fieldErrors.scores ? (
                <p role="alert" className="text-[13px] font-medium text-danger">
                  {fieldErrors.scores}
                </p>
              ) : null}
            </fieldset>
          ) : null}
          <Field id={`fb-${id}`} label={t("feedback")} hint={outcome === "DONE" ? t("feedbackHint") : undefined}>
            <Textarea id={`fb-${id}`} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={5000} className="min-h-24" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {tc("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteSlotButton({ id, label }: { id: string; label: string }) {
  const { run, pending } = useServerAction(deleteSlotAction);
  return (
    <Button variant="ghost" size="icon-sm" loading={pending} aria-label={label} onClick={() => run(id)}>
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
