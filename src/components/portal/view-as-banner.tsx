import { getTranslations } from "next-intl/server";
import { Eye, LogOut } from "lucide-react";
import { exitViewAsAction } from "@/app/admin/(shell)/students/actions";
import { formatInTz } from "@/lib/format";

/**
 * Persistent "Viewing as <name> — read-only · Exit" strip shown on every /app
 * page while an ADMIN is viewing a student's portal (D-120). Server-rendered;
 * strings live under admin.viewAs.
 */
export async function ViewAsBanner({ studentName, exp, timezone }: { studentName: string; exp: number; timezone: string }) {
  const t = await getTranslations("admin.viewAs");
  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-40 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-ink px-4 py-2 text-sm text-white sm:px-6 lg:px-8">
      <p className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-semibold">{t("banner", { name: studentName })}</strong>
          <span className="ml-2 text-white/75">{t("until", { time: formatInTz(new Date(exp), timezone, "h:mm a") })}</span>
        </span>
      </p>
      <form action={exitViewAsAction}>
        <button type="submit" className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-white/30 px-3 text-sm font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t("exit")}
        </button>
      </form>
    </div>
  );
}
