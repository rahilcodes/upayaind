import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Gift, Users } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { StatCard } from "@/components/portal/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ShareLink } from "@/components/student/share-link";
import { requireStudent } from "@/server/auth/guards";
import { getReferralSummary } from "@/server/services/referrals";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Refer a friend" };
export const dynamic = "force-dynamic";

/** Referral programme (D-113): personal link, share buttons, earned credit and friend list. */
export default async function ReferralsPage() {
  const { user } = await requireStudent();
  const t = await getTranslations("student.referrals");
  const r = await getReferralSummary(user);
  const money = (n: number, c = r.currency) => formatMoney(n, c, r.locale);
  const credit = money(r.creditMinor);

  return (
    <>
      <PageHeader title={t("title")} description={t("description", { credit, percent: r.friendPercentOff })} />

      <section className="mb-6 overflow-hidden rounded-[20px] brand-deep p-5 text-white sm:p-6">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/15 sm:flex">
            <Gift className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-bold leading-tight">{t("heroTitle", { credit })}</h2>
            <p className="mt-1 text-[15px] text-[#E3ECFF]">{t("heroBody", { percent: r.friendPercentOff })}</p>
            <ShareLink link={r.link} code={r.code} />
          </div>
        </div>
      </section>

      <section aria-label={t("statsLabel")} className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label={t("earned")} value={money(r.earnedMinor)} tone={r.earnedMinor ? "success" : "default"} hint={t("earnedHint")} />
        <StatCard label={t("pending")} value={money(r.pendingMinor)} hint={t("pendingHint")} />
        <StatCard label={t("friends")} value={r.referrals.length} hint={t("friendsHint")} />
      </section>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {r.referrals.length ? (
            <ul className="divide-y divide-border">
              {r.referrals.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{f.friendFirstName}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {t("joinedOn", { date: formatDate(f.createdAt, user.timezone) })}
                      {f.creditedAt ? ` · ${t("creditedOn", { date: formatDate(f.creditedAt, user.timezone) })}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular">{money(f.creditMinor, f.currency)}</span>
                    <Badge tone={f.status === "CREDITED" ? "green" : "amber"} dot>
                      {t(`status.${f.status}`)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Users className="h-6 w-6" aria-hidden="true" />} title={t("emptyTitle")} body={t("emptyBody")} className="border-0 py-8" />
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-[13px] text-muted-foreground">{t("terms", { percent: r.friendPercentOff, credit })}</p>
    </>
  );
}
