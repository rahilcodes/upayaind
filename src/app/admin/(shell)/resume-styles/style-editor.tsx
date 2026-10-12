"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { deleteStyleAction, saveStyleAction, toggleTemplateAction } from "./actions";

const SECTIONS = ["summary", "skills", "experience", "projects", "education", "certifications", "awards", "languages"] as const;
type SectionKey = (typeof SECTIONS)[number];
const DATE_FORMATS = ["MMM yyyy", "MMMM yyyy", "MM/yyyy", "yyyy-MM"] as const;

export type StyleValue = {
  id?: string;
  code: string;
  name: string;
  documentTitle: string;
  pageSize: "LETTER" | "A4";
  maxPages: number;
  dateFormat: (typeof DATE_FORMATS)[number];
  spelling: string;
  includePhoto: boolean;
  includeDob: boolean;
  includeNationality: boolean;
  includeFullAddress: boolean;
  summaryLabel: string;
  sectionOrder: SectionKey[];
  rulesPrompt: string;
};

const BLANK: StyleValue = {
  code: "",
  name: "",
  documentTitle: "Resume",
  pageSize: "A4",
  maxPages: 2,
  dateFormat: "MMM yyyy",
  spelling: "en-GB",
  includePhoto: false,
  includeDob: false,
  includeNationality: false,
  includeFullAddress: false,
  summaryLabel: "Summary",
  sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications"],
  rulesPrompt: "",
};

/** Ordered section list with keyboard-accessible up/down/remove + add. */
function SectionOrder({ value, onChange }: { value: SectionKey[]; onChange: (v: SectionKey[]) => void }) {
  const t = useTranslations("admin.resumeStyles");
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const missing = SECTIONS.filter((s) => !value.includes(s));
  return (
    <div>
      <ol className="grid gap-1.5" aria-label={t("sectionOrder")}>
        {value.map((s, i) => (
          <li key={s} className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-1.5">
            <span className="tabular w-5 text-[13px] text-muted-foreground">{i + 1}</span>
            <span className="flex-1 text-sm font-medium">{t(`sections.${s}`)}</span>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("moveUp", { section: t(`sections.${s}`) })}>
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label={t("moveDown", { section: t(`sections.${s}`) })}>
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(value.filter((x) => x !== s))} disabled={s === "experience"} aria-label={t("removeSection", { section: t(`sections.${s}`) })}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ol>
      {missing.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {missing.map((s) => (
            <Button key={s} type="button" variant="outline" size="sm" onClick={() => onChange([...value, s])}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t(`sections.${s}`)}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StyleDialog({ value }: { value?: StyleValue }) {
  const t = useTranslations("admin.resumeStyles");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<StyleValue>(value ?? BLANK);
  const { run, pending, fieldErrors } = useServerAction(saveStyleAction, { onSuccess: () => setOpen(false) });
  const set = <K extends keyof StyleValue>(k: K, val: StyleValue[K]) => setV((cur) => ({ ...cur, [k]: val }));
  const pre = value?.id ?? "new";
  const f = (k: string) => `${pre}-${k}`;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(value ?? BLANK);
      }}
    >
      <DialogTrigger asChild>
        {value ? (
          <Button variant="outline" size="sm" aria-label={`${tc("edit")}: ${value.name}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {tc("edit")}
          </Button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("new")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent wide title={value ? t("editTitle", { name: value.name }) : t("newTitle")} description={t("dialogDescription")}>
        <form
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(v);
          }}
        >
          <Field id={f("code")} label={t("code")} hint={t("codeHint")} error={fieldErrors.code}>
            <Input {...fieldA11y(f("code"), fieldErrors.code, true)} value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} maxLength={40} />
          </Field>
          <Field id={f("name")} label={t("name")} error={fieldErrors.name}>
            <Input {...fieldA11y(f("name"), fieldErrors.name)} value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={80} />
          </Field>
          <Field id={f("title")} label={t("documentTitle")} hint={t("documentTitleHint")} error={fieldErrors.documentTitle}>
            <Input {...fieldA11y(f("title"), fieldErrors.documentTitle, true)} value={v.documentTitle} onChange={(e) => set("documentTitle", e.target.value)} maxLength={60} />
          </Field>
          <Field id={f("summary")} label={t("summaryLabel")} error={fieldErrors.summaryLabel}>
            <Input {...fieldA11y(f("summary"), fieldErrors.summaryLabel)} value={v.summaryLabel} onChange={(e) => set("summaryLabel", e.target.value)} maxLength={60} />
          </Field>
          <Field id={f("page")} label={t("pageSize")}>
            <Select id={f("page")} value={v.pageSize} onChange={(e) => set("pageSize", e.target.value as "A4" | "LETTER")}>
              <option value="LETTER">{t("letter")}</option>
              <option value="A4">A4</option>
            </Select>
          </Field>
          <Field id={f("pages")} label={t("maxPages")} error={fieldErrors.maxPages}>
            <Input {...fieldA11y(f("pages"), fieldErrors.maxPages)} type="number" min={1} max={4} value={v.maxPages} onChange={(e) => set("maxPages", Number(e.target.value))} className="tabular" />
          </Field>
          <Field id={f("date")} label={t("dateFormat")}>
            <Select id={f("date")} value={v.dateFormat} onChange={(e) => set("dateFormat", e.target.value as StyleValue["dateFormat"])}>
              {DATE_FORMATS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={f("spelling")} label={t("spelling")} hint={t("spellingHint")} error={fieldErrors.spelling}>
            <Input {...fieldA11y(f("spelling"), fieldErrors.spelling, true)} value={v.spelling} onChange={(e) => set("spelling", e.target.value)} maxLength={10} />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-semibold">{t("personalDetails")}</legend>
            <div className="grid gap-x-5 sm:grid-cols-2">
              {(["includePhoto", "includeDob", "includeNationality", "includeFullAddress"] as const).map((k) => (
                <label key={k} className="inline-flex min-h-11 items-center gap-2 text-sm">
                  <Checkbox checked={v[k]} onChange={(e) => set(k, e.target.checked)} />
                  {t(k)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-semibold">{t("sectionOrder")}</p>
            <SectionOrder value={v.sectionOrder} onChange={(s) => set("sectionOrder", s)} />
            {fieldErrors.sectionOrder ? (
              <p role="alert" className="mt-1 text-[13px] font-medium text-danger">
                {fieldErrors.sectionOrder}
              </p>
            ) : null}
          </div>
          <Field id={f("rules")} label={t("rulesPrompt")} hint={t("rulesPromptHint")} error={fieldErrors.rulesPrompt} className="sm:col-span-2">
            <Textarea {...fieldA11y(f("rules"), fieldErrors.rulesPrompt, true)} value={v.rulesPrompt} onChange={(e) => set("rulesPrompt", e.target.value)} maxLength={4000} className="min-h-28 font-mono text-[13px]" />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
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

export function DeleteStyleButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("admin.resumeStyles");
  const { run, pending } = useServerAction(deleteStyleAction);
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      aria-label={t("deleteFor", { name })}
      onClick={() => {
        if (window.confirm(t("deleteConfirm", { name }))) run(id);
      }}
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}

export function TemplateToggle({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const { run, pending } = useServerAction(toggleTemplateAction);
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
      <Checkbox checked={isActive} disabled={pending} onChange={(e) => run(id, e.target.checked)} />
      <span>{name}</span>
    </label>
  );
}
