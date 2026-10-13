"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const KEY = "upy-install-hint";

function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return ios && safari;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * "Add UpayaInd to your home screen" card on /app for phones (D-110).
 * Android/Chromium: uses `beforeinstallprompt`. iOS Safari: step-by-step
 * instructions (no install API). Dismissal is remembered in localStorage.
 */
export function InstallHint() {
  const t = useTranslations("student.install");
  const [mode, setMode] = React.useState<"hidden" | "prompt" | "ios">("hidden");
  const promptRef = React.useRef<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === "dismissed") return;
    } catch {}
    if (isStandalone()) return;
    const small = window.matchMedia("(max-width: 768px)").matches;
    if (!small) return;
    if (isIosSafari()) {
      setMode("ios");
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      setMode("prompt");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setMode("hidden"));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setMode("hidden");
    try {
      window.localStorage.setItem(KEY, "dismissed");
    } catch {}
  }

  async function install() {
    const p = promptRef.current;
    if (!p) return;
    await p.prompt();
    const choice = await p.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (choice.outcome === "accepted") dismiss();
  }

  if (mode === "hidden") return null;
  return (
    <section aria-labelledby="install-h" className="relative mb-6 flex items-start gap-3 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-accent text-accent-foreground">
        <Smartphone className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 pr-8">
        <h2 id="install-h" className="font-semibold">
          {t("title")}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("body")}</p>
        {mode === "ios" ? (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>
              {t.rich("ios1", { icon: () => <Share className="mx-1 inline h-4 w-4 align-text-bottom" aria-label={t("shareIcon")} /> })}
            </li>
            <li>{t("ios2")}</li>
            <li>{t("ios3")}</li>
          </ol>
        ) : (
          <Button size="sm" className="mt-3" onClick={install}>
            {t("install")}
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-muted hover:text-foreground"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </section>
  );
}
