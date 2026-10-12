"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, ExternalLink, Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

type RevealAction = "REVEAL" | "COPY_USERNAME" | "COPY_PASSWORD";
type Revealed = { username?: string; password?: string; notes?: string | null; hideAfterSeconds: number };
type Result = { ok: true; data: Revealed; message?: string } | { ok: false; error: string };

export type CredentialRow = { id: string; kind: string; label: string; loginUrl: string | null; hasNotes: boolean; updatedAt: string };

/**
 * Vault logins for the assigned specialist (SPEC §10): values stay masked;
 * "Reveal" shows them for 30 s then re-hides; "Copy" writes to the clipboard
 * without displaying. Every reveal/copy is logged server-side.
 */
export function CredentialsPanel({ items, canReveal, action, kindLabels }: { items: CredentialRow[]; canReveal: boolean; action: (id: string, a: RevealAction) => Promise<Result>; kindLabels: Record<string, string> }) {
  const t = useTranslations("work.studentDetail.vault");
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((c) => (
        <CredentialItem key={c.id} c={c} canReveal={canReveal} action={action} kind={kindLabels[c.kind] ?? c.kind} />
      ))}
    </ul>
  );
}

function CredentialItem({ c, canReveal, action, kind }: { c: CredentialRow; canReveal: boolean; action: (id: string, a: RevealAction) => Promise<Result>; kind: string }) {
  const t = useTranslations("work.studentDetail.vault");
  const [shown, setShown] = React.useState<Revealed | null>(null);
  const [left, setLeft] = React.useState(0);
  const [busy, setBusy] = React.useState<RevealAction | null>(null);

  React.useEffect(() => {
    if (!shown) return;
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          setShown(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [shown]);

  const call = async (a: RevealAction) => {
    setBusy(a);
    try {
      const r = await action(c.id, a);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (a === "REVEAL") {
        setShown(r.data);
        setLeft(r.data.hideAfterSeconds || 30);
      } else {
        const value = a === "COPY_USERNAME" ? r.data.username : r.data.password;
        await navigator.clipboard.writeText(value ?? "");
        toast.success(a === "COPY_USERNAME" ? t("copiedUser") : t("copiedPass"));
      }
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(null);
    }
  };

  const mask = "••••••••••";
  return (
    <li className="rounded-[14px] border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-foreground">
            <KeyRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{c.label}</p>
            <p className="text-xs text-muted-foreground">{kind}</p>
          </div>
        </div>
        {c.loginUrl ? (
          <a href={c.loginUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold">
            {t("openSite")}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("username")}</dt>
          <dd className="font-mono break-all">{shown?.username ?? mask}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("password")}</dt>
          <dd className="font-mono break-all">{shown?.password ?? mask}</dd>
        </div>
        {shown?.notes ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("notes")}</dt>
            <dd className="whitespace-pre-wrap">{shown.notes}</dd>
          </div>
        ) : null}
      </dl>
      {canReveal ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {shown ? (
            <Button size="sm" variant="outline" onClick={() => setShown(null)}>
              <EyeOff className="h-4 w-4" aria-hidden="true" />
              {t("hide")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" loading={busy === "REVEAL"} onClick={() => call("REVEAL")}>
              <Eye className="h-4 w-4" aria-hidden="true" />
              {t("reveal")}
            </Button>
          )}
          <Button size="sm" variant="ghost" loading={busy === "COPY_USERNAME"} onClick={() => call("COPY_USERNAME")}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {t("copyUser")}
          </Button>
          <Button size="sm" variant="ghost" loading={busy === "COPY_PASSWORD"} onClick={() => call("COPY_PASSWORD")}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {t("copyPass")}
          </Button>
          {shown ? (
            <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {t("hidesIn", { s: left })}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
