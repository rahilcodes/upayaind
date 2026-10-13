import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WifiOff } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "You’re offline", robots: { index: false } };

/** Branded static page the service worker serves when a navigation fails offline (D-110). */
export default async function OfflinePage() {
  const t = await getTranslations("student.offline");
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-6 text-center">
      <Logo />
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <WifiOff className="h-7 w-7" aria-hidden="true" />
      </div>
      <h1 className="font-display text-4xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("body")}</p>
      <RetryButton label={t("retry")} />
    </main>
  );
}
