"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Homepage section 5 (SPEC §6.2): an interactive, static-data replica of the
 * student dashboard. Fake data only, clearly badged "Demo".
 */

export type DemoApp = { company: string; role: string; applied: string; status: string; ats: number; keywords: string[] };
type Filter = "all" | "active" | "interviews" | "closed";

const ACTIVE = new Set(["APPLIED", "VIEWED", "RECRUITER_REPLIED", "ASSESSMENT"]);
const INTERVIEW = new Set(["INTERVIEW_SCHEDULED", "INTERVIEWING", "OFFER", "HIRED"]);
const CLOSED = new Set(["REJECTED", "NO_RESPONSE", "WITHDRAWN"]);

export function DashboardDemo({
  apps,
  copy,
  statusLabels,
  pills,
}: {
  apps: DemoApp[];
  copy: Record<string, string>;
  statusLabels: Record<string, string>;
  pills: Record<string, string>;
}) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState<number | null>(0);
  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: copy.tabAll! },
    { key: "active", label: copy.tabActive! },
    { key: "interviews", label: copy.tabInterviews! },
    { key: "closed", label: copy.tabClosed! },
  ];
  const rows = apps
    .map((a, i) => ({ ...a, i }))
    .filter((a) => (filter === "all" ? true : filter === "active" ? ACTIVE.has(a.status) : filter === "interviews" ? INTERVIEW.has(a.status) : CLOSED.has(a.status)))
    .filter((a) => !q || `${a.company} ${a.role}`.toLowerCase().includes(q.toLowerCase()));
  const sel = open !== null ? apps[open] : null;
  const responded = apps.filter((a) => !["APPLIED", "VIEWED", "NO_RESPONSE"].includes(a.status)).length;

  return (
    <div role="region" aria-label={copy.regionLabel} className="overflow-hidden rounded-[22px] border border-[#E3E6EF] bg-[#F4F6FB] shadow-[0_30px_60px_-30px_rgba(11,24,70,0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3E6EF] bg-white px-4 py-3.5 sm:px-6">
        <div className="min-w-0">
          <p className="truncate font-semibold">{copy.student}</p>
          <p className="text-[13px] text-[#5A6585]">{copy.planLine}</p>
        </div>
        <span className="rounded-full bg-[#FDF3E1] px-2.5 py-1 text-xs font-bold uppercase tracking-[0.06em] text-[#7A4E0E]">{copy.badge}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-6">
        {[
          { label: copy.statToday, value: "28", suffix: "/ 35", bar: 80 },
          { label: copy.statWeek, value: "131" },
          { label: copy.statResponse, value: `${Math.round((responded / apps.length) * 100)}%` },
          { label: copy.statInterviews, value: String(apps.filter((a) => INTERVIEW.has(a.status)).length), green: true },
        ].map((s) => (
          <div key={s.label} className="rounded-[16px] border border-[#E3E6EF] bg-white px-4 py-3.5">
            <p className="text-[13px] font-medium text-[#4A5578]">{s.label}</p>
            <p className={cn("mt-0.5 text-[26px] font-bold leading-tight tabular", s.green && "text-[#1E7B4F]")}>
              {s.value}
              {s.suffix ? <span className="ml-1 text-sm font-medium text-[#5A6585]">{s.suffix}</span> : null}
            </p>
            {s.bar ? (
              <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E6EAF4]">
                <div className="brand-gradient h-full rounded-full" style={{ width: `${s.bar}%` }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-4 px-4 pb-4 sm:px-6 sm:pb-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 rounded-[16px] border border-[#E3E6EF] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#EEF0F5] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div role="group" aria-label={copy.tabsLabel} className="flex flex-wrap gap-1 rounded-[12px] bg-[#F4F6FB] p-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={filter === t.key}
                  onClick={() => setFilter(t.key)}
                  className="min-h-11 rounded-[9px] px-3 text-sm font-semibold text-[#4A5578] aria-pressed:bg-white aria-pressed:text-ink aria-pressed:shadow-sm"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label className="relative block sm:w-56">
              <span className="sr-only">{copy.searchLabel}</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={copy.search}
                className="h-11 w-full rounded-[10px] border-[1.5px] border-[#D5DAE6] bg-white px-3 text-[15px] placeholder:text-[#5A6585] focus:border-royal focus:outline-none focus:ring-[3px] focus:ring-[rgba(37, 99, 222,0.35)]"
              />
            </label>
          </div>
          <p className="sr-only" aria-live="polite">
            {copy.count!.replace("{count}", String(rows.length))}
          </p>
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[#5A6585]">{copy.empty}</p>
          ) : (
            <ul>
              {rows.map((a) => (
                <li key={a.i} className="border-b border-[#EEF0F5] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpen(a.i)}
                    aria-pressed={open === a.i}
                    className="flex min-h-[60px] w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#F8F9FD] aria-pressed:bg-[#EAF1FE] sm:px-4"
                  >
                    <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-ink text-sm font-bold text-white">
                      {a.company[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{a.role}</span>
                      <span className="block truncate text-[12.5px] text-[#5A6585]">
                        {a.company} · {a.applied}
                      </span>
                    </span>
                    <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", pills[a.status])}>{statusLabels[a.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[16px] border border-[#E3E6EF] bg-white p-5" aria-live="polite">
          {sel ? (
            <>
              <p className="text-[13px] text-[#5A6585]">{sel.company}</p>
              <p className="text-lg font-bold leading-snug">{sel.role}</p>
              <span className={cn("mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", pills[sel.status])}>{statusLabels[sel.status]}</span>
              <div className="mt-5 rounded-[12px] bg-[#F5F7FC] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#5A6585]">{copy.detailTitle}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm">{copy.detailAts}</span>
                  <span className="rounded-full bg-[#E9F5EE] px-2.5 py-1 text-[13px] font-bold text-[#1E7B4F]">{sel.ats}</span>
                </div>
                <p className="mt-3 text-sm">{copy.detailKeywords}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {sel.keywords.map((k) => (
                    <li key={k} className="rounded-[6px] bg-[#D6E5FD] px-2 py-0.5 text-[13px]">
                      {k}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-[12px] border border-[#E3E6EF] px-4 py-3">
                <span className="flex items-center gap-2.5 text-sm font-semibold">
                  <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FCEAE8] text-[11px] font-bold text-[#A82A21]">
                    {copy.resumeShort}
                  </span>
                  {copy.colResume}
                </span>
                <span className="text-[13px] text-[#5A6585]">{sel.applied}</span>
              </div>
            </>
          ) : null}
          <p className="mt-4 text-xs text-[#5A6585]">{copy.sample}</p>
        </div>
      </div>
    </div>
  );
}
