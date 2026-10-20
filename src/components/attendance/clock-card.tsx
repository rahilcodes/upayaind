"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/components/portal/action-form";
import { cn } from "@/lib/utils";

type Result = { ok: true; data?: unknown; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export type ClockState = {
  open: boolean;
  onBreak: boolean;
  startedAt: string | null;
  breakStartedAt: string | null;
  clockedMinutes: number;
  breakMinutes: number;
  activeMinutes: number;
  firstLoginAt: string | null;
  computedAt: string;
  startedLabel: string | null;
  breakStartedLabel: string | null;
  firstLoginLabel: string | null;
  tzLabel: string;
  canTrack: boolean;
  /** Admin-set working window (D-139); null when the account has no employee profile. */
  window: {
    /** "09:00–18:00 ET" */
    label: string;
    enforced: boolean;
    inWindow: boolean;
    /** ISO instant of the next (or current) opening, for the "opens in" countdown. */
    opensAt: string | null;
    /** Next opening in the employee's own zone, e.g. "6:30 PM IST" / "Mon 6:30 PM IST". */
    opensLabel: string | null;
    /** Current window close in the employee's own zone. */
    closesLabel: string | null;
  } | null;
};

const untilLabel = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
};

const fmt = (m: number) => `${Math.floor(m / 60)}h ${String(Math.floor(m % 60)).padStart(2, "0")}m`;

/**
 * Clock card from the approved design: status dot, Clocked / Active / Break
 * figures (ticking client-side), Start/End break and Clock in/out buttons.
 */
export function ClockCard({ state, action }: { state: ClockState; action: (kind: "in" | "out" | "breakStart" | "breakEnd") => Promise<Result> }) {
  const t = useTranslations("work.today.clock");
  const { run, pending } = useServerAction(action);
  const [now, setNow] = React.useState(() => Date.parse(state.computedAt));
  const w = state.window;
  const waitingForWindow = Boolean(w?.enforced && !w.inWindow);
  React.useEffect(() => {
    setNow(Date.now());
    if (!state.open && !waitingForWindow) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.open, state.computedAt, waitingForWindow]);
  // Clock-in opens once the countdown reaches zero (the server re-checks on submit).
  const opensInMs = w?.opensAt ? Date.parse(w.opensAt) - now : null;
  const clockInBlocked = waitingForWindow && (opensInMs === null || opensInMs > 0);
  const windowLine = w
    ? waitingForWindow
      ? opensInMs !== null && opensInMs > 0
        ? t("window.opensIn", { window: w.label, in: untilLabel(opensInMs) })
        : t("window.label", { window: w.label })
      : w.inWindow && w.closesLabel
        ? t("window.closesAt", { window: w.label, at: w.closesLabel })
        : t("window.label", { window: w.label })
    : null;

  const elapsedMin = Math.max(0, (now - Date.parse(state.computedAt)) / 60000);
  const clocked = state.clockedMinutes + (state.open && !state.onBreak ? elapsedMin : 0);
  const brk = state.breakMinutes + (state.onBreak ? elapsedMin : 0);
  const [confirmOut, setConfirmOut] = React.useState(false);

  const mode = !state.open ? "out" : state.onBreak ? "break" : "in";
  const tone = {
    out: { dot: "bg-[#8A93AD]", icon: "bg-surface-muted text-muted-foreground" },
    in: { dot: "bg-success", icon: "bg-[#E9F5EE] text-success dark:bg-success/20" },
    break: { dot: "bg-warning", icon: "bg-[#FDF3E1] text-[#8A5A12] dark:bg-warning/20 dark:text-warning" },
  }[mode];

  const sub =
    mode === "out"
      ? state.clockedMinutes > 0
        ? t("subClockedOut")
        : t("subNotIn")
      : mode === "break"
        ? t("subBreak", { time: state.breakStartedLabel ?? "" })
        : state.firstLoginLabel
          ? t("subInWithLogin", { time: state.startedLabel ?? "", tz: state.tzLabel, login: state.firstLoginLabel })
          : t("subIn", { time: state.startedLabel ?? "", tz: state.tzLabel });

  return (
    <section aria-label={t("aria")} className="flex flex-wrap items-center gap-6 rounded-[18px] border border-border bg-surface px-6 py-5">
      <div className="flex min-w-[240px] flex-[1_1_260px] items-center gap-3.5">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]", tone.icon)}>
          <Clock className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[17px] font-bold" role="status" aria-live="polite">
            <span aria-hidden="true" className={cn("h-[9px] w-[9px] rounded-full", tone.dot)} />
            {t(`status.${mode}`)}
          </p>
          <p className="text-sm text-muted-foreground">{sub}</p>
          {windowLine ? (
            <p className="mt-0.5 text-[13px] text-muted-foreground" suppressHydrationWarning>
              {windowLine}
            </p>
          ) : null}
          {clockInBlocked && !state.open ? (
            <p className="mt-0.5 text-[13px] font-semibold text-[#8A5A12] dark:text-warning" role="status">
              {w?.opensLabel ? t("window.blocked", { at: w.opensLabel }) : t("window.blockedNoDays")}
            </p>
          ) : null}
        </div>
      </div>
      <dl className="flex flex-wrap gap-7 tabular">
        {[
          ["clocked", fmt(clocked)],
          ["active", fmt(state.activeMinutes)],
          ["break", brk >= 60 ? fmt(brk) : `${Math.floor(brk)}m`],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">{t(`fig.${k}`)}</dt>
            <dd className="text-[22px] font-bold" suppressHydrationWarning>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {state.canTrack ? (
        <div className="flex flex-wrap gap-2.5">
          {state.open ? (
            <Button variant="outline" loading={pending} onClick={() => run(state.onBreak ? "breakEnd" : "breakStart")}>
              {state.onBreak ? t("endBreak") : t("startBreak")}
            </Button>
          ) : null}
          {state.open ? (
            confirmOut ? (
              <>
                <Button variant="danger" loading={pending} onClick={() => run("out").then(() => setConfirmOut(false))}>
                  {t("confirmOut")}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmOut(false)}>
                  {t("cancel")}
                </Button>
              </>
            ) : (
              <Button variant="danger" onClick={() => setConfirmOut(true)}>
                {t("clockOut")}
              </Button>
            )
          ) : (
            <Button variant="success" loading={pending} disabled={clockInBlocked} aria-disabled={clockInBlocked} title={clockInBlocked && w?.opensLabel ? t("window.blocked", { at: w.opensLabel }) : undefined} onClick={() => run("in")}>
              {t("clockIn")}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noProfile")}</p>
      )}
    </section>
  );
}
