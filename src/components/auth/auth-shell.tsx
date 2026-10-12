import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/ui/logo";

/** Split auth layout from the approved design: navy brand panel + form card. */
export async function AuthShell({
  variant = "student",
  children,
}: {
  variant?: "student" | "team";
  children: React.ReactNode;
}) {
  const t = await getTranslations("auth");
  const team = variant === "team";
  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <aside className="relative flex flex-col justify-between gap-10 overflow-hidden bg-ink px-6 py-6 text-white sm:px-10 lg:min-h-dvh lg:w-1/2 lg:py-12">
        <svg aria-hidden="true" viewBox="0 0 760 420" className="pointer-events-none absolute -bottom-8 -left-10 hidden w-[760px] opacity-30 lg:block">
          <defs>
            <linearGradient id="authlg" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#0A35D6" />
              <stop offset="0.5" stopColor="#0A7CF0" />
              <stop offset="1" stopColor="#18B8F2" />
            </linearGradient>
          </defs>
          <path d="M20 400 L260 230 L400 300 L720 50" fill="none" stroke="url(#authlg)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M610 50 H720 V160" fill="none" stroke="#18B8F2" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="relative flex items-center gap-3">
          <Link href="/" aria-label="UpayaInd home" className="rounded-md">
            <Logo inverted size={34} />
          </Link>
          {team ? (
            <span className="rounded-full border border-[#34437A] px-2.5 py-1 text-xs font-bold uppercase tracking-[0.08em] text-[#B9C3E3]">
              {t("teamBadge")}
            </span>
          ) : null}
        </div>
        <div className="relative hidden max-w-[460px] lg:block">
          <p className="font-display text-[44px] font-semibold leading-[1.08] tracking-[-0.02em]">
            {team ? t("panelTeamTitle") : t("panelStudentTitle")}
          </p>
          <p className="mt-4 text-[17px] leading-relaxed text-[#C9D1EC]">{team ? t("panelTeamBody") : t("panelStudentBody")}</p>
        </div>
        <p className="relative hidden text-[13px] text-[#8E9AC4] lg:block">{t("panelFootnote")}</p>
      </aside>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-8 sm:px-6 lg:items-center lg:py-12">
        <div className="w-full max-w-[440px] rounded-[20px] border border-border bg-surface p-6 shadow-[0_20px_50px_-24px_rgba(11,24,70,0.25)] sm:p-10">
          {children}
        </div>
      </main>
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-[26px] font-bold tracking-[-0.01em]">{title}</h1>
      {subtitle ? <p className="mt-1.5 text-[15px] text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

export function FormAlert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: React.ReactNode }) {
  const cls = {
    error: "border-[#F3C8C3] bg-[#FCEAE8] text-[#8E231B]",
    success: "border-[#BFE3CF] bg-[#E6F4EC] text-[#155C3A]",
    info: "border-[#C9D7FB] bg-[#EEF2FD] text-[#0A2BA8]",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-[10px] border px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}
