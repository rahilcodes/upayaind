import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Eye, Copy, History } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { VaultManager, VaultNotice } from "@/components/student/vault-manager";
import { requireStudent } from "@/server/auth/guards";
import { listAccessLog, listOwnCredentials } from "@/server/services/vault";
import { formatInTz } from "@/lib/format";

export const metadata: Metadata = { title: "Logins vault" };
export const dynamic = "force-dynamic";

export default async function VaultPage() {
  const { user, student } = await requireStudent();
  const t = await getTranslations("student.vault");
  const [items, log] = await Promise.all([listOwnCredentials(user), listAccessLog(user, student.id, { take: 50 })]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-4">
          <VaultNotice />
          <VaultManager items={items.map((i) => ({ id: i.id, kind: i.kind, label: i.label, loginUrl: i.loginUrl, hasNotes: i.hasNotes, updatedAt: i.updatedAt.toISOString() }))} />
        </div>
        <Card className="content-start self-start">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-[18px] w-[18px]" aria-hidden="true" />
                {t("logTitle")}
              </CardTitle>
              <CardDescription className="mt-1">{t("logDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {log.length === 0 ? (
              <p className="rounded-[12px] bg-surface-muted px-4 py-6 text-center text-sm text-muted-foreground">{t("logEmpty")}</p>
            ) : (
              <ol className="grid gap-0.5">
                {log.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 rounded-[10px] px-1 py-2.5">
                    <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      {l.action === "REVEAL" ? <Eye className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 text-sm">
                      <p>
                        <span className="font-semibold">{l.by}</span> {t(`logAction.${l.action as "REVEAL"}`)} <span className="font-semibold">{l.credentialLabel}</span>
                      </p>
                      <p className="text-[13px] text-muted-foreground">
                        <time dateTime={l.at.toISOString()}>{formatInTz(l.at, user.timezone, "EEE d MMM, h:mm a")}</time>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-4 text-[13px] text-muted-foreground">{t("digestNote")}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
