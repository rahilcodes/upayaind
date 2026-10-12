"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { track, type TrackEvent } from "./track";

/**
 * Cookie consent + analytics for the marketing site (SPEC §6.1, §10).
 * - Banner until the visitor chooses; the choice is kept in the `consent`
 *   cookie (180 days). Footer "Cookie settings" re-opens it.
 * - GA4 and Microsoft Clarity are injected ONLY after "Accept".
 * - Delegated click tracking for `[data-track]` elements.
 * - Plan links (`a[data-plan-id]`) go straight to checkout for a signed-in student.
 */

const COOKIE = "consent";
type Choice = "granted" | "denied";

function readChoice(): Choice | null {
  const m = document.cookie.match(/(?:^|; )consent=(granted|denied)/);
  return (m?.[1] as Choice | undefined) ?? null;
}

function writeChoice(v: Choice) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${v}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax${secure}`;
}

function clearAnalyticsCookies() {
  const host = location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const c of document.cookie.split("; ")) {
    const name = c.split("=")[0] ?? "";
    if (/^(_ga|_gid|_gat|_clck|_clsk|CLID|ANONCHK|MR|MUID|SM)/.test(name)) {
      for (const d of domains) document.cookie = `${name}=; Path=/; Max-Age=0${d ? `; Domain=${d}` : ""}`;
    }
  }
}

let loaded = false;
function loadAnalytics(gaId?: string, clarityId?: string) {
  if (loaded) return;
  loaded = true;
  const w = window as unknown as { dataLayer: unknown[]; gtag: (...a: unknown[]) => void; clarity?: unknown };
  if (gaId && /^G-[A-Z0-9]+$/i.test(gaId)) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer.push(arguments);
    };
    w.gtag("js", new Date());
    w.gtag("config", gaId, { anonymize_ip: true });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(s);
  }
  if (clarityId && /^[a-z0-9]+$/i.test(clarityId)) {
    const c = w as unknown as { clarity: ((...a: unknown[]) => void) & { q?: unknown[] } };
    c.clarity =
      c.clarity ||
      function clarity(...args: unknown[]) {
        (c.clarity.q = c.clarity.q || []).push(args);
      };
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.clarity.ms/tag/${encodeURIComponent(clarityId)}`;
    document.head.appendChild(s);
  }
}

export type ConsentCopy = { title: string; body: React.ReactNode; accept: string; reject: string; label: string };

export function Analytics({ gaId, clarityId, copy }: { gaId?: string; clarityId?: string; copy: ConsentCopy }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Initial state + "Cookie settings" (footer) + delegated click tracking.
  React.useEffect(() => {
    const choice = readChoice();
    if (choice === "granted") loadAnalytics(gaId, clarityId);
    if (!choice) setOpen(true);

    function onClick(e: MouseEvent) {
      const el = (e.target as Element | null)?.closest?.("[data-track],[data-consent-open]");
      if (!el) return;
      if (el.hasAttribute("data-consent-open")) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      const ev = el.getAttribute("data-track") as TrackEvent;
      let props: Record<string, string> = {};
      try {
        props = JSON.parse(el.getAttribute("data-track-props") || "{}");
      } catch {}
      track(ev, props);
      if (ev === "plan_selected" && el.getAttribute("data-checkout") === "1") track("checkout_started", props);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [gaId, clarityId]);

  // Per-page: pricing_view, and send students straight to checkout from plan links.
  React.useEffect(() => {
    if (pathname === "/pricing") track("pricing_view");
    const links = document.querySelectorAll<HTMLAnchorElement>("a[data-plan-id]");
    if (!links.length) return;
    let cancelled = false;
    // Wait until the browser is idle so this never competes with first paint.
    const idle = (cb: () => void) =>
      "requestIdleCallback" in window ? (window as Window & { requestIdleCallback: (f: () => void) => void }).requestIdleCallback(cb) : setTimeout(cb, 1500);
    idle(() => fetch("/api/auth/session", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { user?: { role?: string } } | null) => {
        if (cancelled || s?.user?.role !== "STUDENT") return;
        links.forEach((a) => {
          a.href = `/app/checkout?plan=${encodeURIComponent(a.dataset.planId!)}`;
          a.setAttribute("data-checkout", "1");
        });
      })
      .catch(() => {}));
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  function choose(v: Choice) {
    const before = readChoice();
    writeChoice(v);
    setOpen(false);
    if (v === "granted") loadAnalytics(gaId, clarityId);
    else if (before === "granted" || loaded) {
      clearAnalyticsCookies();
      location.reload(); // unload already-running trackers
    }
  }

  if (!open) return null;
  return (
    <div
      role="region"
      aria-label={copy.label}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[760px] rounded-[18px] border border-sand bg-white p-5 text-ink shadow-[0_24px_60px_-20px_rgba(11,24,70,0.45)] sm:inset-x-6 sm:bottom-6 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold">{copy.title}</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[#3E4A6E]">{copy.body}</p>
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] border-[1.5px] border-ink px-4 text-[15px] font-semibold text-ink hover:bg-ink hover:text-white"
          >
            {copy.reject}
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-royal px-5 text-[15px] font-semibold text-white hover:brand-gradient"
          >
            {copy.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
