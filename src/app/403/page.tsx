import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export const metadata = { title: "No access", robots: { index: false } };

export default async function ForbiddenPage() {
  const t = await getTranslations("auth");
  const c = await getTranslations("common");
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-6 text-center">
      <Logo />
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FCEAE8] text-danger">
        <ShieldAlert className="h-7 w-7" aria-hidden="true" />
      </div>
      <h1 className="font-display text-4xl font-semibold tracking-tight">{t("forbiddenTitle")}</h1>
      <p className="max-w-md text-muted-foreground">{t("forbiddenBody")}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/login" className={buttonVariants({ variant: "primary", size: "lg" })}>
          {c("goToDashboard")}
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
          {c("goHome")}
        </Link>
      </div>
    </main>
  );
}
