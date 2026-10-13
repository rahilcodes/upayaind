import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Download, FileJson } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/server/auth/guards";
import { getDeletionState, getEmailPrefs, hasPassword } from "@/server/services/student-privacy";
import { STUDENT_EMAIL_PREFS } from "@/lib/schemas/student";
import { formatDate } from "@/lib/format";
import { LogoutEverywhereButton } from "@/components/portal/logout-everywhere";
import { logoutEverywhereAction } from "./actions";
import { DeletionPanel, EmailPrefsForm, PasswordForm } from "./settings-forms";
import { WhatsAppPrefForm } from "./whatsapp-pref-form";
import { getWhatsAppPref } from "@/server/services/channels/prefs";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/** Password, email notifications, data export and account deletion (SPEC §10). */
export default async function SettingsPage() {
  const { user } = await requireStudent();
  const t = await getTranslations("student.settings");
  const [prefs, pw, deletion, wa] = await Promise.all([getEmailPrefs(user), hasPassword(user.id), getDeletionState(user), getWhatsAppPref(user.id)]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid max-w-3xl grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("passwordTitle")}</CardTitle>
              <CardDescription className="mt-1">{t("passwordDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5">
            <PasswordForm hasPassword={pw} />
            <LogoutEverywhereButton action={logoutEverywhereAction} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("emailsTitle")}</CardTitle>
              <CardDescription className="mt-1">{t("emailsDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <EmailPrefsForm initial={prefs} keys={STUDENT_EMAIL_PREFS} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("whatsapp.title")}</CardTitle>
              <CardDescription className="mt-1">{t("whatsapp.description")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <WhatsAppPrefForm initial={wa.enabled} phone={wa.phone} phoneValid={wa.phoneValid} available={wa.available} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("exportTitle")}</CardTitle>
              <CardDescription className="mt-1">{t("exportDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <a href="/api/student/export" className={buttonVariants()}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("exportZip")}
            </a>
            <a href="/api/student/export?format=json" className={buttonVariants({ variant: "outline" })}>
              <FileJson className="h-4 w-4" aria-hidden="true" />
              {t("exportJson")}
            </a>
            <p className="w-full text-[13px] text-muted-foreground">{t("exportNote")}</p>
          </CardContent>
        </Card>

        <Card className="border-[#F3C8C3]">
          <CardHeader>
            <div>
              <CardTitle>{t("deleteSection")}</CardTitle>
              <CardDescription className="mt-1">{t("deleteSectionDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <DeletionPanel requestedAt={deletion ? formatDate(deletion, user.timezone) : null} email={user.email} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
