import { getTranslations } from "next-intl/server";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/** Status pill colours (SPEC §13), mirrored from the portal's StatusPill. */
export const PILL: Record<string, string> = {
  APPLIED: "bg-[#E8EFFE] text-[#0A35D6]",
  VIEWED: "bg-[#F0EAFE] text-[#5B2BC4]",
  RECRUITER_REPLIED: "bg-[#FDF3E1] text-[#7A4E0E]",
  ASSESSMENT: "bg-[#E1F6FD] text-[#0B6C8F]",
  INTERVIEW_SCHEDULED: "bg-[#E6F4EC] text-[#1E7B4F]",
  INTERVIEWING: "bg-[#E6F4EC] text-[#1E7B4F]",
  OFFER: "bg-[#1E7B4F] text-white",
  HIRED: "bg-[#1E7B4F] text-white",
  REJECTED: "bg-[#FCEAE8] text-[#A82A21]",
  NO_RESPONSE: "bg-[#EEF0F5] text-[#4A5578]",
};

/**
 * Hero visual: a static replica of the student dashboard (/app) with sample
 * data and a "Demo" badge (SPEC §6.2 — no screenshots of real students).
 */
export async function HeroDashboardMock() {
  const t = await getTranslations("marketing.mock");
  const ts = await getTranslations("status");
  const apps = t.raw("apps") as { title: string; company: string; time: string; status: ApplicationStatus }[];
  return (
    <figure aria-label={t("label")} className="relative m-0 min-w-0">
      <div className="overflow-hidden rounded-[20px] border border-[#E3E6EF] bg-white shadow-[0_30px_60px_-20px_rgba(11,24,70,0.25)]">
        <div className="flex items-center justify-between border-b border-[#EEF0F5] px-5 py-4">
          <div>
            <p className="text-[13px] text-[#5A6585]">{t("greeting")}</p>
            <p className="text-base font-semibold">{t("heading")}</p>
          </div>
          <span className="rounded-full bg-[#FDF3E1] px-2.5 py-1 text-xs font-bold uppercase tracking-[0.06em] text-[#7A4E0E]">{t("badge")}</span>
        </div>
        <div className="grid grid-cols-3 gap-2.5 p-4 sm:gap-3 sm:p-5">
          <div className="rounded-[12px] bg-[#F5F7FC] p-3 sm:p-3.5">
            <p className="text-xs text-[#5A6585]">{t("appliedToday")}</p>
            <p className="text-[22px] font-bold tabular sm:text-[26px]">
              18<span className="text-[15px] font-medium text-[#5A6585]"> / 25</span>
            </p>
            <div role="img" aria-label={t("target")} className="mt-2 h-1.5 overflow-hidden rounded-[3px] bg-[#E3E8F5]">
              <div className="brand-gradient h-1.5 w-[72%]" />
            </div>
          </div>
          <div className="rounded-[12px] bg-[#F5F7FC] p-3 sm:p-3.5">
            <p className="text-xs text-[#5A6585]">{t("thisWeek")}</p>
            <p className="text-[22px] font-bold tabular sm:text-[26px]">94</p>
          </div>
          <div className="rounded-[12px] bg-[#E9F5EE] p-3 sm:p-3.5">
            <p className="text-xs text-[#1E5C3D]">{t("interviews")}</p>
            <p className="text-[22px] font-bold text-[#1E7B4F] tabular sm:text-[26px]">3</p>
          </div>
        </div>
        <ul className="px-4 pb-14 sm:px-5 sm:pb-5">
          {apps.map((a) => (
            <li key={a.company} className="flex items-center gap-3 border-t border-[#EEF0F5] py-3">
              <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-ink text-sm font-bold text-white">
                {a.company[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.title}</p>
                <p className="truncate text-[12.5px] text-[#5A6585]">
                  {a.company} · {a.time}
                </p>
              </div>
              <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", PILL[a.status])}>{ts(a.status)}</span>
              <span aria-hidden="true" className="hidden whitespace-nowrap text-[12.5px] font-semibold text-royal sm:inline">
                {t("resume")}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute -bottom-6 left-3 flex items-center gap-2.5 rounded-[14px] bg-ink px-4 py-3 text-white shadow-[0_14px_30px_-10px_rgba(11,24,70,0.5)] sm:-left-[18px]">
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1E7B4F]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.6" aria-hidden="true">
            <path d="M5 12l5 5 9-10" />
          </svg>
        </span>
        <div>
          <p className="text-xs text-[#B9C3E3]">{t("atsLabel")}</p>
          <p className="text-[15px] font-bold">{t("atsValue")}</p>
        </div>
      </div>
    </figure>
  );
}
