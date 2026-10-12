import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default async function NotFound() {
  const c = await getTranslations("common");
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-6 text-center">
      <Logo />
      <p className="font-display text-7xl font-semibold text-gradient">404</p>
      <h1 className="text-2xl font-bold">{c("notFound")}</h1>
      <Link href="/" className={buttonVariants({ size: "lg" })}>
        {c("goHome")}
      </Link>
    </main>
  );
}
