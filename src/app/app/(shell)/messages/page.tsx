import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Messenger } from "@/components/messaging/messenger";
import { listToJson, threadToJson } from "@/components/messaging/serialize";
import { requireStudent } from "@/server/auth/guards";
import { getThread, listStudentThreads, type ThreadView } from "@/server/services/messaging";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("messaging.student");
  return { title: t("metaTitle") };
}

/** /app/messages — the student's thread with their specialist (+ previous threads, read-only). */
export default async function StudentMessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireStudent();
  const sp = await searchParams;
  const t = await getTranslations("messaging.student");
  const items = await listStudentThreads(user);
  if (!items.length) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <EmptyState className="bg-surface" icon={<MessageSquare className="h-6 w-6" aria-hidden="true" />} title={t("emptyTitle")} body={t("emptyBody")} />
      </>
    );
  }
  const id = sp.thread && items.some((i) => i.id === sp.thread) ? sp.thread : items[0]!.id;
  let initial: ThreadView | null = null;
  try {
    initial = await getThread(user, id);
  } catch {
    initial = null;
  }
  const active = items.find((i) => i.isActive);
  return (
    <>
      <PageHeader title={t("title")} description={active ? t("descriptionWith", { name: active.title }) : t("description")} />
      <Messenger mode="student" initialThreads={listToJson(items.map((i) => (i.id === id ? { ...i, unread: 0 } : i)))} initialThread={initial ? threadToJson(initial) : null} timezone={user.timezone} />
    </>
  );
}
