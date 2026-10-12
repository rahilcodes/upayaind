import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guards";
import { CMS_KINDS, type CmsKind } from "@/server/services/cms";
import { EntryEditor } from "../editor";

export const metadata: Metadata = { title: "New content", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireRole(["ADMIN"]);
  const sp = await searchParams;
  const kind: CmsKind = (CMS_KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as CmsKind) : "PAGE";
  return (
    <EntryEditor
      entry={{
        id: null,
        kind,
        title: "",
        slug: "",
        excerpt: "",
        body: { type: "doc", content: [{ type: "paragraph" }] },
        seoTitle: "",
        seoDescription: "",
        ogImageKey: "",
        canonicalUrl: "",
        noindex: false,
        sortOrder: 0,
        fields: {},
        isPublished: false,
        publishedAt: null,
        updatedAt: null,
        livePath: null,
        revisions: [],
      }}
    />
  );
}
