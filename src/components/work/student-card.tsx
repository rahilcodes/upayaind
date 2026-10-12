import Link from "next/link";
import { useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { RagBar, RagPill, type RagKey } from "./rag";

export type StudentCardData = {
  id: string;
  name: string;
  role: string | null;
  plan: string | null;
  active: boolean;
  onboarded: boolean;
  done: number;
  target: number;
  rag: RagKey;
  lastLabel: string | null;
  unread: number;
  cover: boolean;
};

/** "My students today" card from the approved design. */
export function StudentCard({ s, messageHref }: { s: StudentCardData; messageHref: string }) {
  const t = useTranslations("work.today.card");
  return (
    <article className={cn("flex flex-col gap-3.5 rounded-[16px] border border-border bg-surface p-5", !s.active && "bg-surface-muted grayscale")} aria-label={s.name}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground">
          {initials(s.name)}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/work/students/${s.id}`} className="font-bold text-foreground hover:underline">
            {s.name}
          </Link>
          <p className="truncate text-[13px] text-muted-foreground">
            {[s.role ?? t("noRole"), s.plan ?? t("noPlan")].join(" · ")}
            {s.cover ? ` · ${t("cover")}` : ""}
          </p>
        </div>
        <RagPill rag={s.rag} />
      </div>
      <div>
        <div className="mb-1.5 flex justify-between gap-2 text-sm tabular">
          <span className="font-semibold">{s.target > 0 ? t("applied", { done: s.done, target: s.target }) : t("appliedNoTarget", { done: s.done })}</span>
          <span className="truncate text-muted-foreground">{!s.active ? t("paused") : s.lastLabel ? t("last", { time: s.lastLabel }) : t("noneYet")}</span>
        </div>
        <RagBar done={s.done} target={s.target} rag={s.rag} label={t("progressLabel", { name: s.name })} />
      </div>
      <div className="flex gap-2">
        {s.active ? (
          <Link href={`/work/students/${s.id}/apply`} className="flex h-11 flex-1 items-center justify-center rounded-[10px] bg-ink text-sm font-semibold text-white hover:bg-ink-700 dark:bg-primary">
            {t("applyNext")}
          </Link>
        ) : (
          <span className="flex h-11 flex-1 items-center justify-center rounded-[10px] bg-surface-muted text-sm font-semibold text-muted-foreground">{t("inactive")}</span>
        )}
        <Link
          href={messageHref}
          aria-label={s.unread ? t("messageUnread", { name: s.name, count: s.unread }) : t("message", { name: s.name })}
          className="relative flex h-11 w-11 items-center justify-center rounded-[10px] border-[1.5px] border-border-strong text-foreground hover:bg-surface-muted"
        >
          <MessageSquare className="h-[18px] w-[18px]" aria-hidden="true" />
          {s.unread ? <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-sky px-1 text-[11px] font-bold text-ink">{s.unread}</span> : null}
        </Link>
      </div>
    </article>
  );
}
