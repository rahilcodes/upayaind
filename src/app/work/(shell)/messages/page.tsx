import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/portal/portal-shell";
import { Messenger } from "@/components/messaging/messenger";
import { listToJson, threadToJson } from "@/components/messaging/serialize";
import { requireStaff } from "@/server/auth/guards";
import { getThread, getThreadForAdmin, listAllThreadsForAdmin, listStaffThreads, threadAccess, type ThreadView } from "@/server/services/messaging";
import { assignedStudentIds } from "@/server/services/targets";
import { cn } from "@/lib/utils";
import { BroadcastDialog } from "./broadcast-dialog";
import { isManagerial } from "@/server/auth/rbac";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("messaging.work");
  return { title: t("metaTitle") };
}

/**
 * /work/messages — my student threads (F7). Managers/admins also get an
 * "All conversations" read-only view (`?view=all`), and `?thread=` opens any
 * thread read-only for them.
 */
export default async function WorkMessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, employee } = await requireStaff();
  const sp = await searchParams;
  const t = await getTranslations("messaging.work");
  const isManager = isManagerial(user.role);
  const all = isManager && sp.view === "all";

  const items = all ? await listAllThreadsForAdmin(user) : await listStaffThreads(user);
  let threadId = sp.thread ?? null;
  if (!threadId && sp.student) threadId = items.find((i) => i.studentId === sp.student)?.id ?? null;

  let initial: ThreadView | null = null;
  if (threadId) {
    try {
      const access = await threadAccess(user, threadId);
      initial = access.side === "observer" ? await getThreadForAdmin(user, threadId) : await getThread(user, threadId);
    } catch {
      initial = null;
    }
  }
  const students = employee ? (await assignedStudentIds(employee.id)).size : 0;
  const unreadAfterOpen = items.map((i) => (initial && i.id === initial.id ? { ...i, unread: 0 } : i));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={all ? t("descriptionAll") : t("description")}
        actions={
          <>
            {isManager ? (
              <nav aria-label={t("viewNav")} className="inline-flex rounded-[12px] bg-surface-muted p-1">
                <Link href="/work/messages" aria-current={!all ? "page" : undefined} className={cn("rounded-[10px] px-3.5 py-2 text-sm font-semibold", !all ? "bg-surface shadow-sm" : "text-muted-foreground")}>
                  {t("mine")}
                </Link>
                <Link href="/work/messages?view=all" aria-current={all ? "page" : undefined} className={cn("rounded-[10px] px-3.5 py-2 text-sm font-semibold", all ? "bg-surface shadow-sm" : "text-muted-foreground")}>
                  {t("all")}
                </Link>
              </nav>
            ) : null}
            {!all && employee ? <BroadcastDialog count={students} /> : null}
          </>
        }
      />
      <Messenger key={all ? "all" : "mine"} mode={all ? "observer" : "staff"} listAll={all} initialThreads={listToJson(unreadAfterOpen)} initialThread={initial ? threadToJson(initial) : null} timezone={user.timezone} />
    </>
  );
}
