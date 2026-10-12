"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The only interactive bits of the header: the mobile menu sheet and the
 * market switcher popover. Kept dependency-free (no Radix) to stay tiny.
 */

function useDismiss(open: boolean, close: () => void, refs: React.RefObject<HTMLElement | null>[]) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onDown(e: PointerEvent) {
      if (refs.every((r) => r.current && !r.current.contains(e.target as Node))) close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, close, refs]);
}

export function MobileMenu({
  links,
  labels,
  children,
}: {
  links: { href: string; label: string }[];
  labels: { open: string; close: string; nav: string };
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const btn = React.useRef<HTMLButtonElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  const refs = React.useMemo(() => [btn, panel], []);
  useDismiss(open, close, refs);

  React.useEffect(() => setOpen(false), [pathname]);
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls="mk-mobile-menu"
        aria-label={open ? labels.close : labels.open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-[#DDD9CC] text-ink"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <div
        ref={panel}
        id="mk-mobile-menu"
        hidden={!open}
        className="fixed inset-x-0 bottom-0 top-[77px] z-40 overflow-y-auto border-t border-sand bg-paper px-4 pb-10 pt-4"
      >
        <nav aria-label={labels.nav}>
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href} className="border-b border-sand">
                <Link
                  href={l.href}
                  aria-current={pathname === l.href ? "page" : undefined}
                  className="flex min-h-14 items-center text-lg font-semibold text-ink aria-[current=page]:text-royal"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-6 flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

export function MarketMenu({
  button,
  title,
  items,
  currentLabel,
  up = false,
}: {
  up?: boolean;
  button: React.ReactNode;
  title: string;
  items: { code: string; label: string }[];
  currentLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [current, setCurrent] = React.useState<string | null>(null);
  const id = React.useId();
  const pathname = usePathname();
  const btn = React.useRef<HTMLButtonElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  const refs = React.useMemo(() => [btn, panel], []);
  useDismiss(open, close, refs);
  React.useEffect(() => {
    if (open) setCurrent(document.getElementById("mk-root")?.getAttribute("data-market") ?? null);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-[#DDD9CC] bg-transparent px-3 text-sm font-medium text-ink hover:bg-white"
      >
        {button}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div
        ref={panel}
        id={id}
        hidden={!open}
        className={`absolute ${up ? "bottom-[calc(100%+8px)] left-0" : "right-0 top-[calc(100%+8px)]"} z-50 w-64 rounded-[14px] border border-sand bg-white p-2 shadow-[0_20px_40px_-16px_rgba(11,24,70,0.35)]`}
      >
        <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-[0.08em] text-[#5A6585]">{title}</p>
        <ul>
          {items.map((m) => (
            <li key={m.code}>
              <a
                href={`${pathname}?market=${m.code}`}
                hrefLang="en"
                aria-current={current === m.code ? "true" : undefined}
                className="flex min-h-11 items-center justify-between rounded-[10px] px-3 text-[15px] font-medium text-ink hover:bg-[#F1F4FB]"
              >
                {m.label}
                {current === m.code ? <span className="text-xs font-semibold text-royal">{currentLabel}</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
