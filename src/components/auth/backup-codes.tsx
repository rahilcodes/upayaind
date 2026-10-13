"use client";
import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, Copy, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * One-time display of 2FA backup codes (D-123). Shown right after enrolment
 * and after "Regenerate" on /work/profile. The codes are never shown again.
 */
export function BackupCodesPanel({ codes, continueHref, onDone }: { codes: string[]; continueHref?: string; onDone?: () => void }) {
  const t = useTranslations("work.twofa");
  const [copied, setCopied] = React.useState(false);
  const text = codes.join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the user can still select the codes */
    }
  };
  const download = () => {
    const blob = new Blob([`UpayaInd backup codes\nEach code works once.\n\n${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "upayaind-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-col gap-4" role="region" aria-labelledby="backup-codes-title">
      <div>
        <h2 id="backup-codes-title" className="text-lg font-bold">
          {t("codesTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("codesBody")}</p>
      </div>
      <ol className="grid grid-cols-2 gap-2 rounded-[14px] border border-border bg-surface-muted p-4 font-mono text-[15px] tracking-wider" aria-label={t("codesTitle")}>
        {codes.map((c) => (
          <li key={c} className="select-all rounded-md bg-surface px-3 py-2 text-center">
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? t("copied") : t("copy")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("download")}
        </Button>
      </div>
      {continueHref ? (
        <Link href={continueHref} className={buttonVariants({ size: "lg", className: "w-full" })}>
          {t("savedContinue")}
        </Link>
      ) : (
        <Button type="button" size="lg" className="w-full" onClick={onDone}>
          {t("savedContinue")}
        </Button>
      )}
    </div>
  );
}
