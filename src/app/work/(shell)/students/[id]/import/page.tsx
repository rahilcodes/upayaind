import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { requireStaff } from "@/server/auth/guards";
import { ForbiddenError } from "@/server/auth/access";
import { getWorkspaceData } from "@/server/services/applications";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("workspace.import");
  return { title: t("metaTitle") };
}

/** F4 "Other ways to log": CSV bulk import with preview and per-row errors. */
export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireStaff();
  const t = await getTranslations("workspace");
  let data: Awaited<ReturnType<typeof getWorkspaceData>>;
  try {
    data = await getWorkspaceData(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError || (e instanceof Error && e.name === "ApplicationError")) {
      return (
        <EmptyState
          className="mx-auto mt-10 max-w-xl bg-surface"
          icon={<ShieldAlert className="h-6 w-6" aria-hidden="true" />}
          title={t("noAccessTitle")}
          body={t("noAccessBody")}
          action={
            <Link href="/work/students" className={buttonVariants({ variant: "outline" })}>
              {t("backToStudents")}
            </Link>
          }
        />
      );
    }
    throw e;
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/work/students/${id}/apply`} className="mb-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground sm:min-h-0">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("import.back")}
        </Link>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em] sm:text-[28px]">{t("import.title", { name: data.student.name })}</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">{t("import.description")}</p>
      </div>
      <ImportClient studentId={id} active={data.subscription.active} tz={data.employeeTimezone} />
    </div>
  );
}
