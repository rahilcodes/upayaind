import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/portal/portal-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/server/auth/guards";
import { getStudentProfile } from "@/server/services/student-profile";
import { LinksForm, MasterForm, PersonalForm, ProfilePreferencesForm } from "./profile-forms";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/** Common zones first; the full IANA list follows. */
const COMMON_TZ = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver", "Europe/London", "Europe/Dublin", "Europe/Berlin", "Asia/Kolkata", "Asia/Dubai", "Australia/Sydney"];

export default async function ProfilePage() {
  const { user } = await requireStudent();
  const t = await getTranslations("student.profile");
  const p = await getStudentProfile(user);
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const now = new Date();
  const timezones = [...new Set([p.personal.timezone, ...COMMON_TZ, ...all])].map((value) => {
    let offset = "";
    try {
      offset = new Intl.DateTimeFormat("en-US", { timeZone: value, timeZoneName: "shortOffset" }).formatToParts(now).find((x) => x.type === "timeZoneName")?.value ?? "";
    } catch {}
    return { value, label: `${value.replace(/_/g, " ")}${offset ? ` (${offset})` : ""}` };
  });
  const sections = [
    { id: "personal", label: t("personal") },
    { id: "preferences", label: t("preferences") },
    { id: "links", label: t("links") },
    { id: "master", label: t("master") },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <nav aria-label={t("sections")} className="-mx-4 mb-6 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-muted">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid max-w-4xl grid-cols-1 gap-6">
        <Card id="personal" className="scroll-mt-24">
          <CardHeader>
            <div>
              <CardTitle>{t("personal")}</CardTitle>
              <CardDescription className="mt-1">{t("personalDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <PersonalForm initial={{ name: p.personal.name, phone: p.personal.phone, timezone: p.personal.timezone }} email={p.personal.email} timezones={timezones} />
          </CardContent>
        </Card>
        <Card id="preferences" className="scroll-mt-24">
          <CardHeader>
            <div>
              <CardTitle>{t("preferences")}</CardTitle>
              <CardDescription className="mt-1">{t("preferencesDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ProfilePreferencesForm initial={p.preferences} marketCode={p.market.code} />
          </CardContent>
        </Card>
        <Card id="links" className="scroll-mt-24">
          <CardHeader>
            <CardTitle>{t("links")}</CardTitle>
          </CardHeader>
          <CardContent>
            <LinksForm initial={p.links} />
          </CardContent>
        </Card>
        <section id="master" aria-labelledby="master-h" className="scroll-mt-24">
          <h2 id="master-h" className="text-[20px] font-bold">
            {t("master")}
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">{t("masterDescription")}</p>
          {p.masterIssues.length ? <p className="mb-4 rounded-[12px] border border-[#F0D9AE] bg-[#FDF3E1] px-4 py-3 text-sm text-[#5E3C08]">{t("masterIssues")}</p> : null}
          <MasterForm initial={p.master ?? p.blankMaster} />
        </section>
      </div>
    </>
  );
}
