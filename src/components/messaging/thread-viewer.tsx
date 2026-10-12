import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import type { ThreadView } from "@/server/services/messaging";
import { MessageList } from "./message-list";
import type { ThreadJson } from "./types";

/** Accepts the service's ThreadView (Date objects) or its JSON form. */
type AnyThread = ThreadView | ThreadJson;

function toJson(t: AnyThread): ThreadJson {
  return {
    ...t,
    messages: t.messages.map((m) => ({
      ...m,
      createdAt: typeof m.createdAt === "string" ? m.createdAt : m.createdAt.toISOString(),
      readAt: m.readAt ? (typeof m.readAt === "string" ? m.readAt : m.readAt.toISOString()) : null,
    })),
  } as ThreadJson;
}

/**
 * Read-only conversation viewer for managers/admins (SPEC F7 quality control).
 * Server-renderable. Usage (admin Student 360°):
 *
 *   const thread = await getThreadForAdmin(user, threadId); // services/messaging.ts
 *   <ThreadViewer thread={thread} timezone={user.timezone} />
 */
export function ThreadViewer({ thread, timezone, className }: { thread: AnyThread; timezone: string; className?: string }) {
  const t = useTranslations("messaging.viewer");
  const data = toJson(thread);
  return (
    <section aria-label={t("aria", { student: data.studentName, employee: data.employeeName })} className={className}>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[12px] border border-[#C6D9FC] bg-[#EAF1FE] px-3.5 py-2.5 text-[13px] text-[#1A4FB8] dark:border-border dark:bg-accent dark:text-accent-foreground">
        <Eye className="h-4 w-4" aria-hidden="true" />
        <span>{t("readOnly", { student: data.studentName, employee: data.employeeName })}</span>
        {!data.isActive ? <span className="font-semibold">· {t("closed")}</span> : null}
      </div>
      {data.messages.length ? <MessageList messages={data.messages} mode="observer" timezone={timezone} /> : <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>}
      {data.hasMore ? <p className="mt-3 text-center text-xs text-muted-foreground">{t("older")}</p> : null}
    </section>
  );
}
