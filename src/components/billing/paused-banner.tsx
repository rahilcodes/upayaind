import { getTranslations } from "next-intl/server";
import { PauseCircle } from "lucide-react";
import { getPausedSubscription } from "@/server/services/billing/pause";
import { formatDate } from "@/lib/format";

/** "Your plan is paused" notice for /app and /app/billing (SPEC F11 pause, D-121). Renders nothing when not paused. */
export async function PausedBanner({ studentId, timezone }: { studentId: string; timezone: string }) {
  const paused = await getPausedSubscription(studentId);
  if (!paused) return null;
  const t = await getTranslations("admin.pause");
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-[16px] border border-[#D9DEEA] bg-surface-muted p-4 text-foreground">
      <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="text-sm">
        <p className="font-semibold">{t("studentBannerTitle", { plan: paused.planPrice.plan.name })}</p>
        <p className="text-muted-foreground">{paused.pausedAt ? t("studentBannerBody", { since: formatDate(paused.pausedAt, timezone) }) : t("studentBannerBodyShort")}</p>
      </div>
    </div>
  );
}
