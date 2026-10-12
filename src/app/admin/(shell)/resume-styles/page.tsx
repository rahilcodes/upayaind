import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Palette } from "lucide-react";
import { Section } from "@/components/admin/bits";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAction } from "@/server/auth/guards";
import { listResumeStyles } from "@/server/services/admin-settings";
import { DeleteStyleButton, StyleDialog, TemplateToggle, type StyleValue } from "./style-editor";

export const metadata: Metadata = { title: "Resume styles" };
export const dynamic = "force-dynamic";

export default async function ResumeStylesPage() {
  await requireAction("resume_styles.manage");
  const t = await getTranslations("admin.resumeStyles");
  const { styles, templates } = await listResumeStyles();

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<StyleDialog />} />

      {styles.length === 0 ? (
        <EmptyState icon={<Palette className="h-6 w-6" aria-hidden="true" />} title={t("empty")} className="bg-surface" />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {styles.map((s) => (
            <li key={s.id} className="flex flex-col rounded-[18px] border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-bold">{s.name}</h2>
                  <p className="font-mono text-[12px] text-muted-foreground">{s.code}</p>
                </div>
                <div className="flex items-center gap-1">
                  <StyleDialog value={{ ...s, pageSize: s.pageSize as "A4" | "LETTER", dateFormat: s.dateFormat as StyleValue["dateFormat"], sectionOrder: s.sectionOrder as StyleValue["sectionOrder"] }} />
                  {s.markets.length === 0 ? <DeleteStyleButton id={s.id} name={s.name} /> : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="blue">{s.documentTitle}</Badge>
                <Badge tone="grey">{s.pageSize === "LETTER" ? t("letter") : "A4"}</Badge>
                <Badge tone="grey">{t("pages", { n: s.maxPages })}</Badge>
                <Badge tone="grey">{s.spelling}</Badge>
                <Badge tone="grey">{s.dateFormat}</Badge>
                {s.includePhoto ? <Badge tone="amber">{t("includePhoto")}</Badge> : null}
                {s.includeDob ? <Badge tone="amber">{t("includeDob")}</Badge> : null}
                {s.includeNationality ? <Badge tone="amber">{t("includeNationality")}</Badge> : null}
              </div>
              <p className="mt-3 text-[13px] text-muted-foreground">
                {t("orderLine", { order: s.sectionOrder.map((k) => (k === "summary" ? s.summaryLabel : t(`sections.${k}` as "sections.skills"))).join(" → ") })}
              </p>
              {s.rulesPrompt ? <p className="mt-2 line-clamp-3 overflow-hidden whitespace-pre-line rounded-[10px] bg-surface-muted p-3 text-[13px]">{s.rulesPrompt}</p> : null}
              <p className="mt-auto pt-3 text-[13px]">
                <span className="text-muted-foreground">{t("usedBy")} </span>
                {s.markets.length ? s.markets.map((m) => m.name).join(", ") : <span className="text-muted-foreground">{t("noMarkets")}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Section id="templates" className="mt-6" title={t("templatesTitle")} description={t("templatesDescription")}>
        {templates.length ? (
          <div className="flex flex-wrap gap-x-6">
            {templates.map((tp) => (
              <TemplateToggle key={tp.id} id={tp.id} name={tp.name} isActive={tp.isActive} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("templatesEmpty")}</p>
        )}
      </Section>
    </>
  );
}
