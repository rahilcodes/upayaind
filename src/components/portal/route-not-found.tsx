import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

/** Portal 404 (rendered inside the shell so the sidebar stays) — DECISIONS D-132. */
export async function RouteNotFound({ home }: { home: string }) {
  const t = await getTranslations("system.notFound");
  return (
    <div className="mx-auto max-w-[560px] py-6 text-center sm:py-10">
      <div className="rounded-[var(--radius-xl)] border border-border bg-surface p-6 sm:p-8">
        <p className="text-gradient text-6xl font-bold tracking-tight">404</p>
        <h1 className="mt-3 text-[24px] font-bold leading-tight">{t("title")}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{t("body")}</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href={home} className={buttonVariants()}>
            {t("home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
