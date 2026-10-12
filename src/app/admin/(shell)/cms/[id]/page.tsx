import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { getEntry, publicPath, splitData, type CmsKind } from "@/server/services/cms";
import { EntryEditor, type EditorEntry } from "../editor";

export const metadata: Metadata = { title: "Edit content", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["ADMIN"]);
  const { id } = await params;
  const e = await getEntry(id);
  if (!e) notFound();
  const { fields, revisions } = splitData(e.data);
  const entry: EditorEntry = {
    id: e.id,
    kind: e.kind as CmsKind,
    title: e.title,
    slug: e.slug,
    excerpt: e.excerpt ?? "",
    body: e.body,
    seoTitle: e.seoTitle ?? "",
    seoDescription: e.seoDescription ?? "",
    ogImageKey: e.ogImageKey ?? "",
    canonicalUrl: e.canonicalUrl ?? "",
    noindex: e.noindex,
    sortOrder: e.sortOrder,
    fields: (fields ?? {}) as Record<string, unknown>,
    isPublished: e.isPublished,
    publishedAt: e.publishedAt?.toISOString() ?? null,
    updatedAt: e.updatedAt.toISOString(),
    livePath: e.isPublished ? publicPath(e.kind, e.slug) : null,
    revisions: revisions.map((r, i) => ({ index: i, at: r.at, by: r.by, title: r.title })),
  };
  return <EntryEditor entry={entry} />;
}
