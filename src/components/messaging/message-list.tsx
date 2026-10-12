import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, CheckCheck, FileText, ImageIcon, Megaphone } from "lucide-react";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { StatusPill } from "@/components/portal/status-pill";
import { CompanyLogo } from "@/components/portal/company-logo";
import { formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MarkdownLite } from "./markdown";
import type { MessageJson, MessengerMode } from "./types";

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function applicationHref(mode: MessengerMode, id: string) {
  if (mode === "student") return `/app/applications/${id}`;
  if (mode === "observer") return `/admin/applications?highlight=${id}`;
  return `/work/applications?highlight=${id}`;
}

/**
 * Message bubbles with day separators, attachments, application cards and
 * read receipts. Pure (no client hooks) so the read-only ThreadViewer can
 * render it on the server.
 */
export function MessageList({ messages, mode, timezone, className }: { messages: MessageJson[]; mode: MessengerMode; timezone: string; className?: string }) {
  const t = useTranslations("messaging.thread");
  let lastDay = "";
  return (
    <ol className={cn("flex flex-col gap-3", className)} aria-label={t("listLabel")}>
      {messages.map((m) => {
        const day = formatInTz(m.createdAt, timezone, "yyyy-MM-dd");
        const showDay = day !== lastDay;
        lastDay = day;
        // Observers see the student on the left, staff on the right.
        const right = mode === "observer" ? !m.fromStudent : m.mine;
        return (
          <React.Fragment key={m.id}>
            {showDay ? (
              <li aria-hidden="true" className="my-1 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {formatInTz(m.createdAt, timezone, "EEE d MMM yyyy")}
                <span className="h-px flex-1 bg-border" />
              </li>
            ) : null}
            <li className={cn("flex flex-col gap-1", right ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[min(85%,560px)] rounded-[16px] px-4 py-2.5 text-[15px] leading-relaxed [overflow-wrap:anywhere]",
                  right ? "rounded-br-[6px] bg-primary text-primary-foreground [&_a]:text-white" : "rounded-bl-[6px] border border-border bg-surface text-foreground",
                )}
              >
                <p className="sr-only">{m.senderName}:</p>
                {m.isBroadcast ? (
                  <p className={cn("mb-1 flex items-center gap-1.5 text-xs font-semibold", right ? "text-white/80" : "text-muted-foreground")}>
                    <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("broadcast")}
                  </p>
                ) : null}
                {m.body ? (
                  <p className="whitespace-normal">
                    <MarkdownLite text={m.body} />
                  </p>
                ) : null}
                {m.application ? (
                  <a
                    href={applicationHref(mode, m.application.id)}
                    className={cn("mt-2 flex items-center gap-3 rounded-[12px] border p-2.5 no-underline", right ? "border-white/25 bg-white/10" : "border-border bg-surface-muted")}
                  >
                    <CompanyLogo name={m.application.companyName} domain={m.application.companyDomain} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-semibold", right ? "text-white" : "text-foreground")}>{m.application.jobTitle}</span>
                      <span className={cn("block truncate text-xs", right ? "text-white/80" : "text-muted-foreground")}>{m.application.companyName}</span>
                    </span>
                    <StatusPill status={m.application.status as ApplicationStatus} />
                  </a>
                ) : null}
                {m.attachments.length ? (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {m.attachments.map((a) => (
                      <li key={a.id}>
                        <a
                          href={`/api/files/${a.id}`}
                          className={cn("flex items-center gap-2 rounded-[10px] border px-3 py-2 text-sm no-underline", right ? "border-white/25 bg-white/10 text-white" : "border-border bg-surface-muted text-foreground")}
                        >
                          {a.mime.startsWith("image/") ? <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" /> : <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />}
                          <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                          <span className="shrink-0 text-xs opacity-80">{kb(a.size)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                {mode === "observer" || !m.mine ? <span className="font-medium">{m.senderName}</span> : null}
                <time dateTime={m.createdAt}>{formatInTz(m.createdAt, timezone, "h:mm a")}</time>
                {m.mine && mode !== "observer" ? (
                  m.readAt ? (
                    <span className="inline-flex items-center gap-0.5 text-royal">
                      <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("read")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("sent")}
                    </span>
                  )
                ) : null}
              </p>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}
