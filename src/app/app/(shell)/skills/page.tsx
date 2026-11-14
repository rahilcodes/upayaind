import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStudent } from "@/server/auth/guards";
import { pendingSkillCheck } from "@/server/services/skill-check";
import { SkillCheckForm } from "./skill-check-form";

export const metadata: Metadata = { title: "Skill check" };
export const dynamic = "force-dynamic";

/** Skill check (D-164): the candidate confirms which skills from recent job descriptions they really have. */
export default async function SkillCheckPage() {
  const { student } = await requireStudent();
  const t = await getTranslations("student.skills");
  const pending = await pendingSkillCheck(student.id);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {pending.length ? (
        <SkillCheckForm items={pending} />
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
          title={t("emptyTitle")}
          body={t("emptyBody")}
          action={
            <Link href="/app/profile" className={buttonVariants({ variant: "outline" })}>
              {t("openProfile")}
            </Link>
          }
        />
      )}
    </>
  );
}
