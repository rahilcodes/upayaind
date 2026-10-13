"use client";
import { useEffect } from "react";

/**
 * Registers the service worker for the student portal only (D-110). The worker
 * never caches API responses or user pages; it only provides the offline page
 * and caches immutable build assets.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !window.location.search.includes("sw=1")) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("[pwa] service worker registration failed", e));
  }, []);
  return null;
}
