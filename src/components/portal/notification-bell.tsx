"use client";
import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Dropdown, DropdownContent, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

export function NotificationBell() {
  const t = useTranslations("common");
  const [data, setData] = React.useState<{ items: Item[]; unread: number }>({ items: [], unread: 0 });

  const load = React.useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch {}
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function markAll() {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    load();
  }
  async function markOne(id: string) {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
  }

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label={`${t("notifications")}${data.unread ? `, ${data.unread} unread` : ""}`}
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-[12px] border border-border bg-surface text-foreground hover:bg-surface-muted"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {data.unread ? <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-surface bg-danger" /> : null}
        </button>
      </DropdownTrigger>
      <DropdownContent className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-bold">{t("notifications")}</p>
          {data.unread ? (
            <button type="button" onClick={markAll} className="min-h-9 text-sm font-semibold text-primary hover:underline">
              {t("markAllRead")}
            </button>
          ) : null}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {data.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("noNotifications")}</p>
          ) : (
            <ul>
              {data.items.map((n) => {
                const inner = (
                  <div className={cn("flex gap-3 px-4 py-3", !n.readAt && "bg-accent/40")}>
                    <span aria-hidden="true" className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-blue")} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{n.title}</p>
                      <p className="text-sm text-muted-foreground">{n.body}</p>
                      <p className="mt-1 text-xs text-subtle-foreground">{formatDistanceToNowStrict(new Date(n.createdAt))} ago</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id} className="border-b border-border last:border-0">
                    {n.link ? (
                      <Link href={n.link} onClick={() => markOne(n.id)} className="block hover:bg-surface-muted">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownContent>
    </Dropdown>
  );
}
