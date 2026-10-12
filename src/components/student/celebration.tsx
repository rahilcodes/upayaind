"use client";
import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PartyPopper, X } from "lucide-react";

const COLORS = ["#18B8F2", "#0A7CF0", "#FFFFFF", "#F5C451", "#3DDC97"];

/**
 * OFFER/HIRED celebration card (F5/F6). Gradient card + a short CSS confetti
 * burst that is skipped entirely under prefers-reduced-motion. Dismissal is
 * remembered per application in localStorage.
 */
export function Celebration({ applicationId, status, company, title }: { applicationId: string; status: "OFFER" | "HIRED"; company: string; title: string }) {
  const t = useTranslations("student.dashboard.celebrate");
  const key = `upy-celebrated-${applicationId}-${status}`;
  const [hidden, setHidden] = React.useState(false);
  const [burst, setBurst] = React.useState(false);

  React.useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(key) === "dismissed";
    } catch {}
    if (seen) setHidden(true);
    else if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setBurst(true);
  }, [key]);

  const pieces = React.useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 9) * 0.08,
        dur: 1.6 + ((i * 13) % 10) / 10,
        rot: (i * 47) % 360,
        color: COLORS[i % COLORS.length],
        w: 6 + (i % 3) * 2,
      })),
    [],
  );

  if (hidden) return null;
  return (
    <section aria-labelledby="celebrate-h" className="relative mb-6 overflow-hidden rounded-[20px] bg-ink p-5 text-white sm:p-6" style={{ backgroundImage: "radial-gradient(120% 140% at 100% 0%, rgba(24,184,242,.45), transparent 55%), linear-gradient(120deg, #0B1846 30%, #0A35D6)" }}>
      {burst ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <style>{`@keyframes upy-fall{0%{transform:translateY(-20px) rotate(0)}100%{transform:translateY(260px) rotate(540deg);opacity:0}}`}</style>
          {pieces.map((p, i) => (
            <span key={i} className="absolute top-0 block rounded-[2px]" style={{ left: `${p.left}%`, width: p.w, height: p.w * 0.45, background: p.color, transform: `rotate(${p.rot}deg)`, animation: `upy-fall ${p.dur}s ${p.delay}s ease-in forwards` }} />
          ))}
        </div>
      ) : null}
      <div className="relative flex items-start gap-4">
        <span aria-hidden="true" className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/15 sm:flex">
          <PartyPopper className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="celebrate-h" className="text-[22px] font-bold leading-tight">
            {status === "HIRED" ? t("hiredTitle", { company }) : t("offerTitle", { company })}
          </h2>
          <p className="mt-1 text-[15px] text-[#D7DEF5]">{status === "HIRED" ? t("hiredBody", { title }) : t("offerBody", { title })}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/app/applications/${applicationId}`} className="inline-flex h-11 items-center rounded-[10px] bg-white px-4 text-sm font-semibold text-ink hover:bg-white/90">
              {t("view")}
            </Link>
            <Link href="/app/messages" className="inline-flex h-11 items-center rounded-[10px] border border-white/40 px-4 text-sm font-semibold hover:bg-white/10">
              {t("thank")}
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(key, "dismissed");
            } catch {}
            setHidden(true);
          }}
          aria-label={t("dismiss")}
          className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-[#D7DEF5] hover:bg-white/10"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
