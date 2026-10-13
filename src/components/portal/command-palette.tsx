"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog as D } from "radix-ui";
import { Briefcase, Clock, GraduationCap, LayoutGrid, Search, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ⌘K command palette for /work and /admin (D-125). Searches students,
 * employees and applications through GET /api/search (role-aware server side)
 * plus the portal's own pages client side. Keyboard: ⌘/Ctrl+K opens, arrows
 * move, Enter opens, Esc closes. Recent picks live in localStorage (best effort).
 */

type Hit = { id: string; title: string; subtitle: string | null; href: string };
type Group = "pages" | "students" | "employees" | "applications" | "recent";
type Item = Hit & { group: Group };

const RECENT_KEY = "upy:palette:recent";
const RECENT_MAX = 6;
const DEBOUNCE_MS = 160;

function readRecent(): Item[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed.filter((x) => x && typeof x === "object" && typeof (x as Item).href === "string") as Item[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(item: Item) {
  try {
    const next = [{ ...item, group: "recent" as const }, ...readRecent().filter((r) => r.href !== item.href)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota: ignore */
  }
}

const ICON: Record<Group, React.ComponentType<{ className?: string }>> = { pages: LayoutGrid, students: GraduationCap, employees: Users, applications: Briefcase, recent: Clock };

export function CommandPalette({ portal, items }: { portal: "work" | "admin"; items: { href: string; label: string }[] }) {
  const t = useTranslations("admin.palette");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [remote, setRemote] = React.useState<{ students: Hit[]; employees: Hit[]; applications: Hit[] }>({ students: [], employees: [], applications: [] });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const [recent, setRecent] = React.useState<Item[]>([]);
  const listId = React.useId().replace(/:/g, "");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // ⌘K / Ctrl+K anywhere in the portal.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (open) {
      setRecent(readRecent());
      setQ("");
      setRemote({ students: [], employees: [], applications: [] });
      setError(null);
      setActive(0);
    }
  }, [open]);

  // Debounced remote search.
  React.useEffect(() => {
    if (!open) return;
    const query = q.trim();
    abortRef.current?.abort();
    if (query.length < 2) {
      setRemote({ students: [], employees: [], applications: [] });
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctl.signal, headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(res.status === 429 ? t("tooFast") : t("failed"));
        const data = (await res.json()) as { students: Hit[]; employees: Hit[]; applications: Hit[] };
        if (!ctl.signal.aborted) {
          setRemote(data);
          setError(null);
        }
      } catch (e) {
        if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : t("failed"));
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q, open, t]);

  const query = q.trim().toLowerCase();
  const pages: Item[] = React.useMemo(
    () => items.filter((i) => !query || i.label.toLowerCase().includes(query) || i.href.toLowerCase().includes(query)).slice(0, 8).map((i) => ({ id: i.href, title: i.label, subtitle: i.href, href: i.href, group: "pages" as const })),
    [items, query],
  );
  const groups: { key: Group; items: Item[] }[] = React.useMemo(() => {
    const out: { key: Group; items: Item[] }[] = [];
    if (!query && recent.length) out.push({ key: "recent", items: recent });
    if (remote.students.length) out.push({ key: "students", items: remote.students.map((h) => ({ ...h, group: "students" })) });
    if (remote.employees.length) out.push({ key: "employees", items: remote.employees.map((h) => ({ ...h, group: "employees" })) });
    if (remote.applications.length) out.push({ key: "applications", items: remote.applications.map((h) => ({ ...h, group: "applications" })) });
    if (pages.length) out.push({ key: "pages", items: pages });
    return out;
  }, [query, recent, remote, pages]);
  const flat = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);

  React.useEffect(() => {
    setActive(0);
  }, [flat.length, q]);

  const go = React.useCallback(
    (item: Item) => {
      pushRecent(item);
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      const item = flat[active];
      if (item) {
        e.preventDefault();
        go(item);
      }
    } else if (e.key === "Home") {
      setActive(0);
    } else if (e.key === "End") {
      setActive(Math.max(0, flat.length - 1));
    }
  };

  React.useEffect(() => {
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  const activeId = flat.length ? `${listId}-opt-${active}` : undefined;
  let index = -1;

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-border bg-surface px-3 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          aria-label={t("open")}
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="hidden md:inline">{t("placeholder")}</span>
          <kbd className="hidden rounded-md border border-border bg-surface-muted px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted-foreground md:inline" aria-hidden="true">
            ⌘K
          </kbd>
        </button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px]" />
        <D.Content
          className="portal fixed left-1/2 top-[8vh] z-50 flex max-h-[80vh] w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-surface text-foreground shadow-[var(--shadow-float)] focus:outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">{t("title")}</D.Title>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded={flat.length > 0}
              aria-controls={listId}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              aria-label={t("title")}
              autoComplete="off"
              spellCheck={false}
              placeholder={t("placeholder")}
              className="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
            />
            <D.Close className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-surface-muted" aria-label={t("close")}>
              <X className="h-4 w-4" aria-hidden="true" />
            </D.Close>
          </div>
          <div id={listId} role="listbox" aria-label={t("results")} className="overflow-y-auto p-2">
            {error ? (
              <p role="alert" className="px-3 py-6 text-center text-sm text-danger">
                {error}
              </p>
            ) : null}
            {!error && !flat.length ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground" aria-live="polite">
                {loading ? t("searching") : query.length >= 2 ? t("noResults") : t("hint", { portal: portal === "admin" ? t("adminPortal") : t("workPortal") })}
              </p>
            ) : null}
            {groups.map((g) => {
              const Icon = ICON[g.key];
              return (
                <div key={g.key} role="group" aria-labelledby={`${listId}-g-${g.key}`} className="mb-1">
                  <p id={`${listId}-g-${g.key}`} className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-subtle-foreground">
                    {t(`group.${g.key}`)}
                  </p>
                  {g.items.map((item) => {
                    index++;
                    const i = index;
                    const selected = i === active;
                    return (
                      <div
                        key={`${g.key}-${item.id}`}
                        id={`${listId}-opt-${i}`}
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => go(item)}
                        className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2", selected ? "bg-accent text-accent-foreground" : "hover:bg-surface-muted")}
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{item.title}</span>
                          {item.subtitle ? <span className="block truncate text-[12px] text-muted-foreground">{item.subtitle}</span> : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-muted-foreground" aria-hidden="true">
            <span>↑↓ {t("keys.move")}</span>
            <span>↵ {t("keys.open")}</span>
            <span>esc {t("keys.close")}</span>
            {loading ? <span className="ml-auto">{t("searching")}</span> : null}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
