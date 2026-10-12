"use client";
import * as React from "react";

/**
 * Billing-period switch for the pricing page. The cards for every interval are
 * server-rendered (good for SEO and no-JS); this only toggles which panel shows.
 */
export function IntervalTabs({
  idBase,
  label,
  tabs,
  panels,
}: {
  idBase: string;
  label: string;
  tabs: { key: string; label: string; badge?: string }[];
  panels: Record<string, React.ReactNode>;
}) {
  const [active, setActive] = React.useState(tabs[0]?.key ?? "");
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: React.KeyboardEvent, i: number) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + tabs.length) % tabs.length;
    setActive(tabs[next]!.key);
    refs.current[next]?.focus();
  }

  return (
    <div>
      {tabs.length > 1 ? (
        <div className="mb-10 flex justify-center">
          <div role="tablist" aria-label={label} className="inline-flex flex-wrap justify-center gap-1 rounded-[14px] border border-sand bg-white p-1.5">
            {tabs.map((t, i) => (
              <button
                key={t.key}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${idBase}-tab-${t.key}`}
                aria-selected={active === t.key}
                aria-controls={`${idBase}-panel-${t.key}`}
                tabIndex={active === t.key ? 0 : -1}
                onClick={() => setActive(t.key)}
                onKeyDown={(e) => onKey(e, i)}
                className="inline-flex min-h-11 items-center gap-2 rounded-[10px] px-4 text-[15px] font-semibold text-[#3E4A6E] aria-selected:bg-ink aria-selected:text-white"
              >
                {t.label}
                {t.badge ? <span className="rounded-full bg-[#E6F4EC] px-2 py-0.5 text-xs font-bold text-[#1E7B4F]">{t.badge}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {tabs.map((t) => (
        <div
          key={t.key}
          role={tabs.length > 1 ? "tabpanel" : undefined}
          id={`${idBase}-panel-${t.key}`}
          aria-labelledby={tabs.length > 1 ? `${idBase}-tab-${t.key}` : undefined}
          hidden={active !== t.key}
        >
          {panels[t.key]}
        </div>
      ))}
    </div>
  );
}
