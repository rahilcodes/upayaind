"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Eye, History, Pencil, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea, fieldA11y } from "@/components/ui/input";
import type { CmsKind } from "@/server/services/cms";
import { deleteEntryAction, previewAction, publishAction, restoreRevisionAction, saveEntryAction } from "./actions";
import { ImageUploadForm, type Uploaded } from "./image-upload";
import { RichTextEditor } from "./rich-text";
import "@/components/marketing/prose.css";

export type EditorEntry = {
  id: string | null;
  kind: CmsKind;
  title: string;
  slug: string;
  excerpt: string;
  body: unknown;
  seoTitle: string;
  seoDescription: string;
  ogImageKey: string;
  canonicalUrl: string;
  noindex: boolean;
  sortOrder: number;
  fields: Record<string, unknown>;
  isPublished: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
  livePath: string | null;
  revisions: { index: number; at: string; by: string | null; title: string }[];
};

const PATHS: Partial<Record<CmsKind, string>> = { LEGAL: "/legal/", BLOG: "/blog/", STORY: "/success-stories/", LANDING: "/for/" };
const LEGAL = ["privacy", "terms", "refund", "guarantee", "cookies"];

function toSlug(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

type Errors = Record<string, string[] | undefined>;
const err = (e: Errors, k: string) => e[k]?.[0];

function PhotoField({ label, id, alt, onChange }: { label: string; id: string | undefined; alt: string | undefined; onChange: (v: { id?: string; alt?: string }) => void }) {
  const t = useTranslations("cms.image");
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/media/${id}`} alt={alt ?? ""} width={64} height={64} className="h-16 w-16 rounded-full border border-border object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground">
            <Upload className="h-5 w-5" />
          </span>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {id ? t("replace") : t("upload")}
        </Button>
        {id ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ id: undefined, alt: undefined })}>
            {t("remove")}
          </Button>
        ) : null}
      </div>
      {id && alt ? <p className="text-[13px] text-muted-foreground">{alt}</p> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("dialogTitle")}>
          <ImageUploadForm
            submitLabel={t("upload")}
            defaultAlt={alt}
            onUploaded={(img: Uploaded) => {
              onChange({ id: img.id, alt: img.alt });
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageHeader({ title, actions, eyebrow }: { title: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em] sm:text-[28px]">{title}</h1>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function EntryEditor({ entry }: { entry: EditorEntry }) {
  const t = useTranslations("cms");
  const router = useRouter();
  const kind = entry.kind;
  const [v, setV] = React.useState(entry);
  const [dirty, setDirty] = React.useState(false);
  const [errors, setErrors] = React.useState<Errors>({});
  const [saving, startSave] = React.useTransition();
  const [busy, startBusy] = React.useTransition();
  const [slugTouched, setSlugTouched] = React.useState(Boolean(entry.id));
  const [preview, setPreview] = React.useState<{ html: string; missingAlt: boolean } | null>(null);
  const [ogOpen, setOgOpen] = React.useState(false);

  React.useEffect(() => setV(entry), [entry]);
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function set<K extends keyof EditorEntry>(k: K, val: EditorEntry[K]) {
    setV((p) => ({ ...p, [k]: val }));
    setDirty(true);
  }
  function setField(k: string, val: unknown) {
    setV((p) => ({ ...p, fields: { ...p.fields, [k]: val } }));
    setDirty(true);
  }
  const f = (k: string) => (v.fields[k] as string | number | undefined | null) ?? "";

  function save() {
    startSave(async () => {
      const r = await saveEntryAction({
        id: v.id ?? undefined,
        kind,
        title: v.title,
        slug: v.slug,
        excerpt: v.excerpt,
        body: v.body,
        seoTitle: v.seoTitle,
        seoDescription: v.seoDescription,
        ogImageKey: v.ogImageKey,
        canonicalUrl: v.canonicalUrl,
        noindex: v.noindex,
        sortOrder: v.sortOrder,
        fields: kind === "STORY" || kind === "TEAM" ? v.fields : null,
      });
      if (r.ok) {
        setErrors({});
        setDirty(false);
        toast.success(r.message ?? t("actions.savedAt"));
        if (!v.id) router.replace(`/admin/cms/${r.data.id}`);
        else router.refresh();
      } else {
        const fe: Errors = { ...(r.fieldErrors ?? {}) };
        setErrors(fe);
        toast.error(r.error);
      }
    });
  }

  function run(p: Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) {
    startBusy(async () => {
      const r = await p;
      if (r.ok) {
        if (r.message) toast.success(r.message);
        after?.();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function showPreview() {
    startBusy(async () => {
      const r = await previewAction(v.body);
      if (r.ok) setPreview(r.data);
      else toast.error(r.error);
    });
  }

  const path = kind === "PAGE" ? (v.slug === "about" ? "/about" : null) : PATHS[kind] ? `${PATHS[kind]}${v.slug || "…"}` : null;
  const kindOne = t(`kindOne.${kind}`);
  const titleLabel = kind === "FAQ" ? t("fields.titleFaq") : kind === "STORY" ? t("fields.titleStory") : t("fields.title");
  const seoTitleLen = (v.seoTitle || v.title).length;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/admin/cms?kind=${kind}`} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("back", { kind: t(`kinds.${kind}`) })}
          </Link>
        }
        title={v.id ? t("editTitle", { kind: kindOne }) : t("newTitle", { kind: kindOne })}
        actions={
          <>
            {dirty ? <Badge tone="amber">{t("actions.unsaved")}</Badge> : null}
            {kind !== "TEAM" ? (
              <Button type="button" variant="outline" onClick={showPreview} loading={busy && !saving}>
                <Eye className="h-4 w-4" aria-hidden="true" />
                {t("actions.preview")}
              </Button>
            ) : null}
            <Button type="button" onClick={save} loading={saving}>
              {saving ? t("actions.saving") : t("actions.save")}
            </Button>
          </>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
        noValidate
      >
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-5">
              <Field id="cms-title" label={titleLabel} error={err(errors, "title")}>
                <Input
                  {...fieldA11y("cms-title", err(errors, "title"))}
                  value={v.title}
                  maxLength={200}
                  onChange={(e) => {
                    set("title", e.target.value);
                    if (!slugTouched && kind !== "LEGAL") setV((p) => ({ ...p, title: e.target.value, slug: toSlug(e.target.value) }));
                  }}
                />
              </Field>
              <Field id="cms-slug" label={t("fields.slug")} hint={path ? t("fields.slugHint", { path }) : undefined} error={err(errors, "slug")}>
                {kind === "LEGAL" ? (
                  <select
                    {...fieldA11y("cms-slug", err(errors, "slug"), Boolean(path))}
                    value={v.slug}
                    onChange={(e) => set("slug", e.target.value)}
                    className="h-12 w-full rounded-[var(--radius-md)] border-[1.5px] border-border-strong bg-surface px-3.5 text-[15px]"
                  >
                    <option value="">—</option>
                    {LEGAL.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      {...fieldA11y("cms-slug", err(errors, "slug"), Boolean(path))}
                      value={v.slug}
                      maxLength={80}
                      className="font-mono text-sm"
                      onChange={(e) => {
                        setSlugTouched(true);
                        set("slug", e.target.value.toLowerCase());
                      }}
                    />
                    <Button type="button" variant="outline" className="h-12 shrink-0" onClick={() => set("slug", toSlug(v.title))}>
                      {t("fields.slugGenerate")}
                    </Button>
                  </div>
                )}
              </Field>
              {kind !== "TEAM" ? (
                <Field id="cms-excerpt" label={t("fields.excerpt")} hint={t("fields.excerptHint")} error={err(errors, "excerpt")}>
                  <Textarea {...fieldA11y("cms-excerpt", err(errors, "excerpt"), true)} value={v.excerpt} maxLength={500} rows={2} className="min-h-20" onChange={(e) => set("excerpt", e.target.value)} />
                </Field>
              ) : null}
            </CardContent>
          </Card>

          {kind === "STORY" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("story.title")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                {(
                  [
                    ["studentName", t("story.studentName"), "text"],
                    ["role", t("story.role"), "text"],
                    ["company", t("story.company"), "text"],
                    ["companyDomain", t("story.companyDomain"), "text"],
                    ["weeksToOffer", t("story.weeksToOffer"), "number"],
                    ["applicationsSent", t("story.applicationsSent"), "number"],
                  ] as const
                ).map(([k, label, type]) => (
                  <Field key={k} id={`cms-f-${k}`} label={label} hint={k === "companyDomain" ? t("story.companyDomainHint") : undefined} error={err(errors, `fields.${k}`)}>
                    <Input
                      {...fieldA11y(`cms-f-${k}`, err(errors, `fields.${k}`), k === "companyDomain")}
                      type={type}
                      inputMode={type === "number" ? "numeric" : undefined}
                      min={type === "number" ? 0 : undefined}
                      value={String(f(k))}
                      onChange={(e) => setField(k, type === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value)}
                    />
                  </Field>
                ))}
                <Field id="cms-f-quote" label={t("story.quote")} error={err(errors, "fields.quote")} className="sm:col-span-2">
                  <Textarea {...fieldA11y("cms-f-quote", err(errors, "fields.quote"))} value={String(f("quote"))} maxLength={400} rows={3} className="min-h-24" onChange={(e) => setField("quote", e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <PhotoField
                    label={t("story.photo")}
                    id={(v.fields.photoId as string | undefined) || undefined}
                    alt={(v.fields.photoAlt as string | undefined) || undefined}
                    onChange={(p) => {
                      setField("photoId", p.id);
                      setV((s) => ({ ...s, fields: { ...s.fields, photoId: p.id, photoAlt: p.alt } }));
                    }}
                  />
                </div>
                <Field id="cms-f-videoUrl" label={t("story.videoUrl")} error={err(errors, "fields.videoUrl")} className="sm:col-span-2">
                  <Input {...fieldA11y("cms-f-videoUrl", err(errors, "fields.videoUrl"))} value={String(f("videoUrl"))} inputMode="url" placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => setField("videoUrl", e.target.value)} />
                </Field>
                <label className="flex min-h-11 items-start gap-3 text-sm sm:col-span-2">
                  <Checkbox checked={Boolean(v.fields.consentConfirmed)} onChange={(e) => setField("consentConfirmed", e.target.checked)} className="mt-0.5" />
                  <span>{t("story.consent")}</span>
                </label>
              </CardContent>
            </Card>
          ) : null}

          {kind === "TEAM" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("team.title")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                {(
                  [
                    ["name", t("team.name")],
                    ["role", t("team.role")],
                  ] as const
                ).map(([k, label]) => (
                  <Field key={k} id={`cms-f-${k}`} label={label} error={err(errors, `fields.${k}`)}>
                    <Input {...fieldA11y(`cms-f-${k}`, err(errors, `fields.${k}`))} value={String(f(k))} onChange={(e) => setField(k, e.target.value)} />
                  </Field>
                ))}
                <Field id="cms-f-linkedin" label={t("team.linkedin")} error={err(errors, "fields.linkedin")} className="sm:col-span-2">
                  <Input {...fieldA11y("cms-f-linkedin", err(errors, "fields.linkedin"))} value={String(f("linkedin"))} inputMode="url" placeholder="https://www.linkedin.com/in/…" onChange={(e) => setField("linkedin", e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <PhotoField
                    label={t("team.photo")}
                    id={(v.fields.photoId as string | undefined) || undefined}
                    alt={(v.fields.photoAlt as string | undefined) || undefined}
                    onChange={(p) => setV((s) => ({ ...s, fields: { ...s.fields, photoId: p.id, photoAlt: p.alt } }))}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {kind !== "TEAM" ? (
            <div className="flex flex-col gap-2">
              <span id="cms-body-label" className="text-sm font-semibold">
                {kind === "FAQ" ? t("fields.bodyFaq") : t("fields.body")}
              </span>
              <RichTextEditor value={v.body} onChange={(doc) => set("body", doc)} labelId="cms-body-label" invalid={Boolean(err(errors, "body"))} />
              {err(errors, "body") ? (
                <p role="alert" className="text-[13px] font-medium text-danger">
                  {err(errors, "body")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("status.title")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={entry.isPublished ? "green" : "grey"} dot>
                  {entry.isPublished ? t("status.live") : t("status.draft")}
                </Badge>
                {entry.livePath ? (
                  <a href={entry.livePath} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
                    {t("view")}
                  </a>
                ) : null}
              </div>
              {!path ? <p className="text-[13px] text-muted-foreground">{t("status.noPage")}</p> : null}
              {v.id ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={entry.isPublished ? "outline" : "success"}
                    disabled={dirty}
                    title={dirty ? t("actions.saveFirst") : undefined}
                    loading={busy}
                    onClick={() => run(publishAction(v.id!, !entry.isPublished))}
                  >
                    {entry.isPublished ? t("actions.unpublish") : t("actions.publish")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => {
                      if (window.confirm(t("actions.deleteConfirm", { title: v.title }))) run(deleteEntryAction(v.id!), () => router.push(`/admin/cms?kind=${kind}`));
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {t("actions.delete")}
                  </Button>
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">{t("actions.saveFirst")}</p>
              )}
              {dirty && v.id ? <p className="text-[13px] text-muted-foreground">{t("actions.saveFirst")}</p> : null}
              <Field id="cms-sort" label={t("fields.sortOrder")} hint={t("fields.sortOrderHint")} error={err(errors, "sortOrder")}>
                <Input {...fieldA11y("cms-sort", err(errors, "sortOrder"), true)} type="number" inputMode="numeric" value={v.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value) || 0)} className="w-32" />
              </Field>
            </CardContent>
          </Card>

          {kind !== "FAQ" && kind !== "TEAM" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("seo.title")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div aria-label={t("seo.googlePreview")} role="group" className="rounded-[12px] border border-border bg-white p-4 text-[#202124]">
                  <p className="truncate text-xs text-[#4d5156]">upayaind.com{path ?? ""}</p>
                  <p className="mt-1 line-clamp-2 text-[17px] leading-snug text-[#1a0dab]">{(v.seoTitle || v.title || "—").slice(0, 60)}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-[#4d5156]">{(v.seoDescription || v.excerpt || "").slice(0, 155)}</p>
                </div>
                <Field id="cms-seoTitle" label={t("seo.seoTitle")} hint={t("seo.seoTitleHint", { count: seoTitleLen })} error={err(errors, "seoTitle")}>
                  <Input {...fieldA11y("cms-seoTitle", err(errors, "seoTitle"), true)} value={v.seoTitle} maxLength={60} onChange={(e) => set("seoTitle", e.target.value)} />
                </Field>
                <Field id="cms-seoDescription" label={t("seo.seoDescription")} hint={t("seo.seoDescriptionHint", { count: (v.seoDescription || v.excerpt).length })} error={err(errors, "seoDescription")}>
                  <Textarea {...fieldA11y("cms-seoDescription", err(errors, "seoDescription"), true)} value={v.seoDescription} maxLength={155} rows={3} className="min-h-20" onChange={(e) => set("seoDescription", e.target.value)} />
                </Field>
                <Field id="cms-canonical" label={t("seo.canonical")} hint={t("seo.canonicalHint")} error={err(errors, "canonicalUrl")}>
                  <Input {...fieldA11y("cms-canonical", err(errors, "canonicalUrl"), true)} value={v.canonicalUrl} inputMode="url" onChange={(e) => set("canonicalUrl", e.target.value)} />
                </Field>
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold">{t("seo.ogImage")}</span>
                  {v.ogImageKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/media/${v.ogImageKey}`} alt="" width={1200} height={630} className="aspect-[1200/630] w-full rounded-[10px] border border-border object-cover" />
                  ) : (
                    <p className="text-[13px] text-muted-foreground">{t("seo.ogImageHint")}</p>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setOgOpen(true)}>
                      {v.ogImageKey ? t("image.replace") : t("image.upload")}
                    </Button>
                    {v.ogImageKey ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => set("ogImageKey", "")}>
                        {t("image.remove")}
                      </Button>
                    ) : null}
                  </div>
                  <Dialog open={ogOpen} onOpenChange={setOgOpen}>
                    <DialogContent title={t("image.dialogTitle")}>
                      <ImageUploadForm
                        submitLabel={t("image.upload")}
                        onUploaded={(img) => {
                          set("ogImageKey", img.id);
                          setOgOpen(false);
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
                <label className="flex min-h-11 items-start gap-3 text-sm">
                  <Checkbox checked={v.noindex} onChange={(e) => set("noindex", e.target.checked)} className="mt-0.5" />
                  <span>{t("seo.noindex")}</span>
                </label>
              </CardContent>
            </Card>
          ) : null}

          {v.id ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-[18px] w-[18px]" aria-hidden="true" />
                  {t("revisions.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-[13px] text-muted-foreground">{t("revisions.sub", { max: 20 })}</p>
                {entry.revisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("revisions.empty")}</p>
                ) : (
                  <ol className="flex max-h-[360px] flex-col overflow-y-auto">
                    {entry.revisions.map((r) => (
                      <li key={r.index} className="flex items-center justify-between gap-3 border-t border-border py-2 first:border-t-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            <time dateTime={r.at}>{new Date(r.at).toLocaleString()}</time>
                            {r.by ? ` · ${t("revisions.by", { name: r.by })}` : ""}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(t("revisions.restoreConfirm"))) run(restoreRevisionAction(v.id!, r.index), () => setDirty(false));
                          }}
                        >
                          {t("revisions.restore")}
                        </Button>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </form>

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent title={t("preview.title")} description={t("preview.note")} wide className="max-w-3xl">
          {preview?.missingAlt ? (
            <p role="alert" className="mb-4 rounded-[10px] border border-[#F0D9AE] bg-[#FDF3E1] px-4 py-3 text-sm text-[#5E3C08]">
              {t("preview.missingAlt")}
            </p>
          ) : null}
          <div className="rounded-[14px] bg-[#F7F9FF] p-6 text-[#0B1846]">
            <p className="mb-4 font-display text-[32px] font-semibold leading-tight">{v.title}</p>
            {preview ? <div className="cms-prose" dangerouslySetInnerHTML={{ __html: preview.html }} /> : null}
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="button" variant="outline" onClick={() => setPreview(null)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {t("actions.edit")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <span className="sr-only" aria-live="polite">
        {saving ? t("actions.saving") : ""}
      </span>
    </>
  );
}
