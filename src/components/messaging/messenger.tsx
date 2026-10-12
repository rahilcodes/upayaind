"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, Eye, Lock, Paperclip, Search, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatInTz } from "@/lib/format";
import { cn, initials } from "@/lib/utils";
import { MessageList } from "./message-list";
import type { MessengerMode, ThreadJson, ThreadListItemJson } from "./types";

const POLL_MS = 15_000;
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg";

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? "Request failed");
  return j as T;
}

/** setInterval that pauses while the tab is hidden (SPEC F7: poll every 15 s while open). */
function usePoll(fn: () => void, ms: number, enabled = true) {
  const ref = React.useRef(fn);
  ref.current = fn;
  React.useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") ref.current();
    };
    const id = window.setInterval(tick, ms);
    const onVis = () => document.visibilityState === "visible" && ref.current();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ms, enabled]);
}

/**
 * Two-pane messenger (desktop) / stacked (mobile) for /work/messages and
 * /app/messages. Data comes from /api/messages; the open thread and the list
 * are polled every 15 s while the tab is visible (plain interval fetch — no
 * React Query provider is mounted app-wide; D-073).
 */
export function Messenger({
  mode,
  initialThreads,
  initialThread,
  timezone,
  listAll = false,
  extraHeader,
}: {
  mode: MessengerMode;
  initialThreads: ThreadListItemJson[];
  initialThread: ThreadJson | null;
  timezone: string;
  listAll?: boolean;
  extraHeader?: React.ReactNode;
}) {
  const t = useTranslations("messaging");
  const router = useRouter();
  const pathname = usePathname();
  const [threads, setThreads] = React.useState(initialThreads);
  const [thread, setThread] = React.useState<ThreadJson | null>(initialThread);
  const [selected, setSelected] = React.useState<string | null>(initialThread?.id ?? null);
  const [q, setQ] = React.useState("");
  const [loadingThread, setLoadingThread] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const lastCount = React.useRef(initialThread?.messages.length ?? 0);

  const listUrl = `/api/messages${listAll ? "?all=1" : ""}`;
  const refreshList = React.useCallback(() => {
    getJson<{ items: ThreadListItemJson[] }>(listUrl)
      .then((r) => setThreads(r.items))
      .catch(() => undefined);
  }, [listUrl]);

  const loadThread = React.useCallback(async (id: string, opts: { quiet?: boolean } = {}) => {
    if (!opts.quiet) setLoadingThread(true);
    try {
      const data = await getJson<ThreadJson>(`/api/messages/${id}`);
      setThread((cur) => (cur?.id === id || !opts.quiet ? data : cur));
      // Opening marks messages read: drop the unread badge locally.
      setThreads((ts) => ts.map((x) => (x.id === id ? { ...x, unread: 0 } : x)));
    } catch (e) {
      if (!opts.quiet) toast.error((e as Error).message);
    } finally {
      if (!opts.quiet) setLoadingThread(false);
    }
  }, []);

  usePoll(() => {
    refreshList();
    if (selected) void loadThread(selected, { quiet: true });
  }, POLL_MS);

  // Scroll to the newest message when the count grows.
  React.useEffect(() => {
    const n = thread?.messages.length ?? 0;
    if (n !== lastCount.current) bottomRef.current?.scrollIntoView({ block: "end" });
    lastCount.current = n;
  }, [thread?.messages.length]);
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread?.id]);

  const select = (id: string) => {
    setSelected(id);
    if (thread?.id !== id) setThread(null);
    void loadThread(id);
    const sp = new URLSearchParams(window.location.search);
    sp.set("thread", id);
    sp.delete("student");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };
  const back = () => {
    setSelected(null);
    const sp = new URLSearchParams(window.location.search);
    sp.delete("thread");
    sp.delete("student");
    router.replace(sp.toString() ? `${pathname}?${sp}` : pathname, { scroll: false });
    router.refresh();
  };

  const filtered = q ? threads.filter((x) => x.title.toLowerCase().includes(q.toLowerCase()) || (x.subtitle ?? "").toLowerCase().includes(q.toLowerCase())) : threads;
  const showSearch = mode !== "student";

  return (
    <div className="flex h-[calc(100dvh-170px)] min-h-[520px] overflow-hidden rounded-[18px] border border-border bg-surface">
      {/* Thread list */}
      <div className={cn("flex w-full flex-col border-border md:w-[320px] md:shrink-0 md:border-r", selected ? "hidden md:flex" : "flex")}>
        {extraHeader ? <div className="border-b border-border p-3">{extraHeader}</div> : null}
        {showSearch ? (
          <div className="border-b border-border p-3">
            <label className="relative block">
              <span className="sr-only">{t("list.search")}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("list.search")}
                className="h-10 w-full rounded-[10px] border-[1.5px] border-border-strong bg-surface pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-ring"
              />
            </label>
          </div>
        ) : null}
        <ul className="flex-1 overflow-y-auto" aria-label={t("list.aria")}>
          {filtered.length === 0 ? <li className="p-6 text-center text-sm text-muted-foreground">{t(mode === "student" ? "list.emptyStudent" : "list.empty")}</li> : null}
          {filtered.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => select(x.id)}
                aria-current={selected === x.id ? "true" : undefined}
                className={cn("flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left hover:bg-surface-muted", selected === x.id && "bg-accent hover:bg-accent")}
              >
                <span aria-hidden="true" className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold", x.isActive ? "bg-accent text-accent-foreground" : "bg-surface-muted text-muted-foreground")}>
                  {initials(x.title)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate", x.unread ? "font-bold" : "font-semibold")}>{x.title}</span>
                    {x.last ? <time className="shrink-0 text-xs text-muted-foreground" dateTime={x.last.at}>{formatInTz(x.last.at, timezone, "d MMM")}</time> : null}
                  </span>
                  {x.subtitle ? (
                    <span className="block truncate text-xs text-muted-foreground">{x.subtitle.startsWith("cover:") ? t("list.coverFor", { name: x.subtitle.slice(6) }) : t("list.with", { name: x.subtitle })}</span>
                  ) : null}
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={cn("min-w-0 flex-1 truncate text-[13px]", x.unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {x.last ? `${x.last.mine && mode !== "observer" ? `${t("list.you")}: ` : ""}${x.last.preview || (x.last.hasAttachment ? t("list.attachment") : "")}` : t("list.noMessages")}
                    </span>
                    {!x.isActive ? <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{t("list.previous")}</span> : null}
                    {x.unread ? (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sky px-1.5 text-[11px] font-bold text-ink">
                        {x.unread}
                        <span className="sr-only"> {t("list.unread")}</span>
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Conversation */}
      <div className={cn("min-w-0 flex-1 flex-col", selected ? "flex" : "hidden md:flex")}>
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">{t("thread.pick")}</div>
        ) : !thread ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground" role="status">
            {loadingThread ? t("thread.loading") : t("thread.pick")}
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={back} aria-label={t("thread.back")}>
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground">
                {initials(mode === "observer" ? thread.studentName : thread.counterpart)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold">{mode === "observer" ? `${thread.studentName} ↔ ${thread.employeeName}` : thread.counterpart}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {mode === "student" ? (thread.isActive ? t("thread.yourSpecialist") : t("thread.previousSpecialist")) : mode === "observer" ? t("thread.observer") : t("thread.student")}
                </p>
              </div>
              {mode === "staff" ? (
                <Link href={`/work/students/${thread.studentId}`} className="hidden text-sm font-semibold sm:inline">
                  {t("thread.viewStudent")}
                </Link>
              ) : null}
            </header>
            <div className="flex-1 overflow-y-auto bg-canvas px-3 py-4 sm:px-5" aria-live="polite" aria-relevant="additions">
              {thread.messages.length ? (
                <MessageList messages={thread.messages} mode={thread.side === "observer" ? "observer" : mode} timezone={timezone} />
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">{mode === "student" ? t("thread.emptyStudent", { name: thread.counterpart }) : t("thread.empty")}</p>
              )}
              <div ref={bottomRef} />
            </div>
            {thread.canWrite ? (
              <Composer threadId={thread.id} onSent={() => void loadThread(thread.id, { quiet: true }).then(refreshList)} allowLink />
            ) : (
              <p className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
                {thread.side === "observer" ? <Eye className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                {thread.side === "observer" ? t("thread.readOnlyObserver") : t("thread.readOnlyClosed")}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type LinkApp = { id: string; companyName: string; jobTitle: string; status: string };

function Composer({ threadId, onSent, allowLink }: { threadId: string; onSent: () => void; allowLink: boolean }) {
  const t = useTranslations("messaging.composer");
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [appId, setAppId] = React.useState<string>("");
  const [apps, setApps] = React.useState<LinkApp[] | null>(null);
  const [showLink, setShowLink] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();

  React.useEffect(() => {
    setBody("");
    setFiles([]);
    setAppId("");
    setApps(null);
    setShowLink(false);
    setError(null);
  }, [threadId]);

  const openLink = () => {
    setShowLink((v) => !v);
    if (!apps) {
      getJson<{ items: LinkApp[] }>(`/api/messages/${threadId}/applications`)
        .then((r) => setApps(r.items))
        .catch(() => setApps([]));
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > MAX_BYTES) {
        setError(t("tooBig", { name: f.name }));
        continue;
      }
      if (next.length >= MAX_FILES) {
        setError(t("tooMany", { max: MAX_FILES }));
        break;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    if (sending) return;
    if (!body.trim() && !files.length) {
      setError(t("empty"));
      return;
    }
    setSending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("body", body);
      if (appId) fd.set("applicationId", appId);
      for (const f of files) fd.append("files", f);
      const r = await fetch(`/api/messages/${threadId}`, { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? t("failed"));
      setBody("");
      setFiles([]);
      setAppId("");
      setShowLink(false);
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const linked = apps?.find((a) => a.id === appId);
  return (
    <div className="border-t border-border bg-surface p-3">
      {files.length || linked ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {linked ? (
            <li className="flex items-center gap-1.5 rounded-full bg-accent py-1 pl-3 pr-1 text-xs font-semibold text-accent-foreground">
              <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
              {linked.companyName} — {linked.jobTitle}
              <button type="button" onClick={() => setAppId("")} aria-label={t("unlink")} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/50">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ) : null}
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-full bg-surface-muted py-1 pl-3 pr-1 text-xs font-semibold">
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="max-w-[160px] truncate">{f.name}</span>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={t("removeFile", { name: f.name })} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-border">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showLink && allowLink ? (
        <div className="mb-2">
          <label htmlFor={`${id}-app`} className="mb-1 block text-xs font-semibold text-muted-foreground">
            {t("linkLabel")}
          </label>
          <select
            id={`${id}-app`}
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            className="h-10 w-full rounded-[10px] border-[1.5px] border-border-strong bg-surface px-3 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">{apps ? (apps.length ? t("linkPick") : t("linkNone")) : t("linkLoading")}</option>
            {(apps ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.companyName} — {a.jobTitle}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mb-2 text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-label={t("attach")} id={`${id}-file`} onChange={(e) => addFiles(e.target.files)} />
        <Button variant="ghost" size="icon" type="button" onClick={() => fileRef.current?.click()} aria-label={t("attach")} title={t("attachHint")}>
          <Paperclip className="h-5 w-5" aria-hidden="true" />
        </Button>
        {allowLink ? (
          <Button variant="ghost" size="icon" type="button" onClick={openLink} aria-label={t("link")} aria-expanded={showLink}>
            <Briefcase className="h-5 w-5" aria-hidden="true" />
          </Button>
        ) : null}
        <label htmlFor={`${id}-body`} className="sr-only">
          {t("label")}
        </label>
        <Textarea
          id={`${id}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={t("placeholder")}
          maxLength={5000}
          rows={1}
          className="max-h-40 min-h-11 flex-1 resize-y py-2.5"
          aria-describedby={`${id}-hint`}
        />
        <Button type="button" onClick={() => void send()} loading={sending} aria-label={t("send")}>
          <Send className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t("send")}</span>
        </Button>
      </div>
      <p id={`${id}-hint`} className="mt-1.5 hidden text-xs text-muted-foreground sm:block">
        {t("hint")}
      </p>
    </div>
  );
}
