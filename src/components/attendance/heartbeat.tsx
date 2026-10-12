"use client";
import * as React from "react";

const INTERVAL_MS = 60_000;
const IDLE_AFTER_MS = 5 * 60_000;

/**
 * Activity heartbeat (SPEC F8). Mounted once in the /work layout: every 60 s,
 * while the tab is visible AND the user moved the mouse, typed, scrolled or
 * touched in the last 5 minutes, POST /api/heartbeat. Renders nothing.
 */
export function Heartbeat() {
  React.useEffect(() => {
    let last = Date.now();
    const mark = () => {
      last = Date.now();
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;
    for (const e of events) window.addEventListener(e, mark, { passive: true });
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last > IDLE_AFTER_MS) return;
      void fetch("/api/heartbeat", { method: "POST", keepalive: true }).catch(() => undefined);
    };
    ping();
    const id = window.setInterval(ping, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") mark();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      for (const e of events) window.removeEventListener(e, mark);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, []);
  return null;
}
