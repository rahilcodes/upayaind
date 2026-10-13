"use client";
import * as React from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, Bug, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

/**
 * Branded error boundary body for portal `error.tsx` files (DECISIONS D-132).
 * The sidebar/topbar stay mounted (the boundary sits below the layout). "Report"
 * sends the error to Sentry and shows the event id so support can find it;
 * without a DSN the button explains that reporting is off.
 */
export function RouteError({ error, reset, home }: { error: Error & { digest?: string }; reset: () => void; home: string }) {
  const t = useTranslations("system.error");
  const [eventId, setEventId] = React.useState<string | null>(null);
  const configured = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

  React.useEffect(() => {
    // Automatic capture (no-op without a DSN); the Report button re-uses the id.
    const id = Sentry.captureException(error);
    if (configured) setEventId(id);
  }, [error, configured]);

  const reference = eventId ?? error.digest ?? null;

  return (
    <div role="alert" className="mx-auto max-w-[560px] py-6 sm:py-10">
      <div className="rounded-[var(--radius-xl)] border border-border bg-surface p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[#FCEAE8] text-[#B42318]">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <Logo height={24} />
        </div>
        <h1 className="mt-5 text-[24px] font-bold leading-tight">{t("title")}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{t("body")}</p>
        {reference ? (
          <p className="mt-4 rounded-[var(--radius-md)] bg-surface-muted px-3 py-2 font-mono text-[13px] text-muted-foreground">
            {t("reference")}: <span className="select-all text-foreground">{reference}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" onClick={reset}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("retry")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!configured || Boolean(eventId)}
            title={!configured ? t("notConfigured") : undefined}
            onClick={() => setEventId(Sentry.captureException(error, { tags: { reported_by_user: "true" } }))}
          >
            <Bug className="h-4 w-4" aria-hidden="true" />
            {eventId ? t("reported") : t("report")}
          </Button>
          <Link href={home} className={buttonVariants({ variant: "ghost" })}>
            {t("home")}
          </Link>
        </div>
        {!configured ? <p className="mt-3 text-[13px] text-muted-foreground">{t("notConfigured")}</p> : null}
      </div>
    </div>
  );
}
