import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/admin/bits";
import { PageHeader } from "@/components/portal/portal-shell";
import { requireAction } from "@/server/auth/guards";
import { db } from "@/server/db";
import { templateDefaults } from "@/server/services/admin-settings";
import { getSettings } from "@/server/services/settings";
import { BusinessForm, GeneralForm, PublicSiteForm, ReferralForm, TemplateEditor } from "./settings-forms";
import { WebhooksForm } from "./webhooks-form";
import type { AlertWebhook } from "@/server/services/alerts";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAction("settings.manage");
  const t = await getTranslations("admin.settings");
  const [s, markets] = await Promise.all([getSettings(), db.market.findMany({ orderBy: { name: "asc" }, select: { code: true, name: true, isActive: true, currency: true } })]);
  const templates = templateDefaults();

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6">
        <Section id="general" title={t("generalTitle")} description={t("generalDescription")}>
          <GeneralForm value={{ autoAssignEnabled: s.autoAssignEnabled, defaultMaxStudents: s.defaultMaxStudents, noResponseDays: s.noResponseDays, belowTargetAlertTime: s.belowTargetAlertTime, aiLimits: s.aiLimits }} />
        </Section>
        <Section id="public-site" title={t("publicSiteTitle")} description={t("publicSiteDescription")}>
          <PublicSiteForm value={s.publicSite} markets={markets.filter((m) => m.isActive).map((m) => ({ code: m.code, name: m.name }))} />
        </Section>
        <Section id="business" title={t("businessTitle")} description={t("businessDescription")}>
          {markets.length ? (
            <div className="grid gap-3">
              {[...markets].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)).map((m) => (
                <details key={m.code} open={m.isActive} className="rounded-[14px] border border-border">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                    <span>
                      {m.name} <span className="text-[13px] font-normal text-muted-foreground">({m.code}{m.isActive ? "" : ` · ${t("inactiveMarket")}`})</span>
                    </span>
                    <span className="text-[13px] font-normal text-muted-foreground">{s.business?.[m.code]?.legalName || t("notSet")}</span>
                  </summary>
                  <div className="border-t border-border p-4">
                    <BusinessForm market={m} value={s.business?.[m.code] ?? null} />
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noMarkets")}</p>
          )}
        </Section>
        <Section id="referral" title={t("referralTitle")} description={t("referralDescription")}>
          <ReferralForm value={s.referral} currencies={markets.map((m) => m.currency)} />
        </Section>
        <Section id="webhooks" title={t("webhooks.title")} description={t("webhooks.description")}>
          <WebhooksForm value={(s.alertWebhooks ?? []) as AlertWebhook[]} />
        </Section>
        <Section id="templates" title={t("templatesTitle")} description={t("templatesDescription")}>
          <div className="grid gap-2.5">
            {templates.map((tpl) => (
              <TemplateEditor key={tpl.type} tpl={tpl} override={s.notificationTemplates?.[tpl.type] ?? null} />
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
