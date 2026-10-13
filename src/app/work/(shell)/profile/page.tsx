import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/server/auth/guards";
import { getMyWorkProfile } from "@/server/services/work-dashboard";
import { formatInTz } from "@/lib/format";
import { backupCodesRemaining } from "@/server/services/accounts";
import { LogoutEverywhereButton } from "@/components/portal/logout-everywhere";
import { logoutEverywhereAction } from "./actions";
import { BackupCodesForm, PasswordForm, ProfileForm } from "./profile-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("work.profile");
  return { title: t("metaTitle") };
}

/** /work/profile — name, phone, timezone, read-only schedule, password, 2FA status. */
export default async function WorkProfilePage() {
  const { user } = await requireStaff();
  const t = await getTranslations("work.profile");
  const tr = await getTranslations("role");
  const p = await getMyWorkProfile(user);
  const backupRemaining = p.totpEnabled ? await backupCodesRemaining(user.id) : 0;
  const zones = Intl.supportedValuesOf("timeZone");
  if (!zones.includes(p.timezone)) zones.unshift(p.timezone);
  const dayNames = [1, 2, 3, 4, 5, 6, 7].map((i) => formatInTz(new Date(Date.UTC(2026, 0, 4 + i, 12)), "UTC", "EEE"));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>{t("details")}</CardTitle><CardDescription>{p.email} · {tr(p.role)}{p.employee ? ` · ${p.employee.employeeCode}` : ""}</CardDescription></div></CardHeader>
          <CardContent><ProfileForm initial={{ name: p.name, phone: p.phone ?? "", timezone: p.timezone }} zones={zones} /></CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><div><CardTitle>{t("schedule.title")}</CardTitle><CardDescription>{t("schedule.readOnly")}</CardDescription></div></CardHeader>
            <CardContent>
              {p.schedule ? (
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">{t("schedule.days")}</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {dayNames.map((d, i) => (
                        <span key={d} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.schedule!.days.includes(i + 1) ? "bg-accent text-accent-foreground" : "bg-surface-muted text-muted-foreground line-through"}`}>{d}</span>
                      ))}
                    </dd>
                  </div>
                  <div><dt className="text-muted-foreground">{t("schedule.start")}</dt><dd className="font-semibold tabular">{p.schedule.startTime}</dd></div>
                  <div><dt className="text-muted-foreground">{t("schedule.hours")}</dt><dd className="font-semibold tabular">{t("schedule.hoursValue", { h: p.schedule.hours })}</dd></div>
                  {p.employee?.title ? <div><dt className="text-muted-foreground">{t("schedule.jobTitle")}</dt><dd className="font-semibold">{p.employee.title}</dd></div> : null}
                  {p.managerName ? <div><dt className="text-muted-foreground">{t("schedule.manager")}</dt><dd className="font-semibold">{p.managerName}</dd></div> : null}
                  {p.employee?.joiningDate ? <div><dt className="text-muted-foreground">{t("schedule.joined")}</dt><dd className="font-semibold">{formatInTz(p.employee.joiningDate, "UTC", "d MMM yyyy")}</dd></div> : null}
                </dl>
              ) : <p className="text-sm text-muted-foreground">{t("schedule.none")}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("security")}</CardTitle></CardHeader>
            <CardContent className="grid gap-5">
              <div className="flex items-start gap-3 rounded-[12px] bg-surface-muted p-3.5">
                {p.totpEnabled ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" /> : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />}
                <div className="text-sm">
                  <p className="font-semibold">{p.totpEnabled ? t("twofa.on") : t("twofa.off")}</p>
                  <p className="text-muted-foreground">{t("twofa.help")}</p>
                  {p.lastLoginAt ? <p className="mt-1 text-xs text-muted-foreground">{t("lastLogin", { when: formatInTz(p.lastLoginAt, p.timezone, "d MMM yyyy, h:mm a") })}</p> : null}
                </div>
              </div>
              <PasswordForm />
              {p.totpEnabled ? <BackupCodesForm remaining={backupRemaining} /> : null}
              <LogoutEverywhereButton action={logoutEverywhereAction} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
