"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, fieldA11y } from "@/components/ui/input";
import { uploadImageAction } from "./actions";

export type Uploaded = { id: string; src: string; alt: string; width: number | null; height: number | null };

/** Image upload with REQUIRED alt text (SPEC §6.1 / §11). Stored as a public "cms" file. */
export function ImageUploadForm({ submitLabel, onUploaded, defaultAlt = "" }: { submitLabel: string; onUploaded: (img: Uploaded) => void; defaultAlt?: string }) {
  const t = useTranslations("cms.image");
  const [pending, start] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({});
  const idBase = React.useId().replace(/:/g, "");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    const form = new FormData(e.currentTarget);
    const alt = String(form.get("alt") ?? "").trim();
    const file = form.get("file") as File | null;
    const errs: Record<string, string | undefined> = {};
    if (!alt) errs.alt = t("altRequired");
    if (!file || file.size === 0) errs.file = t("file");
    setErrors(errs);
    if (errs.alt || errs.file) return;
    start(async () => {
      const r = await uploadImageAction(form);
      if (r.ok) onUploaded(r.data);
      else {
        setErrors({ [r.fieldErrors?.alt ? "alt" : "file"]: r.error });
        toast.error(r.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field id={`${idBase}-file`} label={t("file")} error={errors.file}>
        <input
          {...fieldA11y(`${idBase}-file`, errors.file)}
          name="file"
          type="file"
          accept="image/png,image/jpeg"
          className="block w-full rounded-[var(--radius-md)] border-[1.5px] border-dashed border-border-strong bg-surface-muted p-3 text-sm file:mr-3 file:min-h-10 file:rounded-[8px] file:border-0 file:bg-primary file:px-3 file:font-semibold file:text-white"
        />
      </Field>
      <Field id={`${idBase}-alt`} label={t("alt")} hint={t("altHint")} error={errors.alt}>
        <Input {...fieldA11y(`${idBase}-alt`, errors.alt, true)} name="alt" defaultValue={defaultAlt} maxLength={300} required />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {pending ? t("uploading") : submitLabel}
        </Button>
      </div>
    </form>
  );
}
