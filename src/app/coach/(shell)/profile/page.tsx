import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { KeyValue } from "@/components/admin/bits";
import { LogoutEverywhereButton } from "@/components/portal/logout-everywhere";
import { PageHeader } from "@/components/portal/portal-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAction } from "@/server/auth/guards";
import { getCoachProfile } from "@/server/services/coach";
import { formatInTz } from "@/lib/format";
import { logoutEverywhereAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("coach.profile");
  return { title: t("metaTitle") };
}

/** /coach/profile — read-only account details + sign-in security (D-140). */
export default async function CoachProfilePage() {
  const user = await requireAction("coach.sessions");
  const t = await getTranslations("coach.profile");
  const tr = await getTranslations("role");
  const p = await getCoachProfile(user);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("details")}</CardTitle>
              <CardDescription>
                {tr(p.role)}
                {p.employee ? ` · ${p.employee.employeeCode}` : ""}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <KeyValue
              items={[
                { label: t("name"), value: p.name },
                { label: t("email"), value: p.email },
                { label: t("phone"), value: p.phone ?? "—" },
                { label: t("timezone"), value: p.timezone },
                { label: t("code"), value: p.employee?.employeeCode ?? "—" },
                { label: t("jobTitle"), value: p.employee?.title ?? "—" },
                { label: t("joined"), value: p.employee?.joiningDate ? formatInTz(p.employee.joiningDate, "UTC", "d MMM yyyy") : "—" },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("security")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="flex items-start gap-3 rounded-[12px] bg-surface-muted p-3.5">
              {p.totpEnabled ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" /> : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />}
              <div className="text-sm">
                <p className="font-semibold">{p.totpEnabled ? t("twofaOn") : t("twofaOff")}</p>
                <p className="text-muted-foreground">{t("twofaHelp")}</p>
                {p.lastLoginAt ? <p className="mt-1 text-xs text-muted-foreground">{t("lastLogin", { when: formatInTz(p.lastLoginAt, p.timezone, "d MMM yyyy, h:mm a") })}</p> : null}
              </div>
            </div>
            <div className="rounded-[12px] border border-border p-3.5 text-sm">
              <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
                {t("changePassword")}
              </Link>
              <p className="mt-0.5 text-muted-foreground">{t("changePasswordHint")}</p>
            </div>
            <LogoutEverywhereButton action={logoutEverywhereAction} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
