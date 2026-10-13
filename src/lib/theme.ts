/**
 * Portal theme preference (light / dark / system). Stored in the `theme` cookie
 * (so the server and the inline boot script agree) and mirrored in localStorage.
 * Applied as `<html data-theme="…">`; see globals.css for the scoping rules.
 */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "theme";
export const THEME_STORAGE_KEY = "upayaind:theme";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}

/**
 * Runs before the portal paints. Reads cookie → localStorage and sets
 * `data-theme` on <html>. Kept dependency-free and tiny; wrapped in try/catch
 * because storage can throw in private windows.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )theme=(light|dark|system)/);var t=m?m[1]:null;if(!t){try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}}if(t!=="light"&&t!=="dark"&&t!=="system")t="system";document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

/** Client-side: persist and apply a theme. */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  try {
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } catch {}
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
}

/** Client-side: the current preference (defaults to "system"). */
export function readTheme(): Theme {
  if (typeof document === "undefined") return "system";
  const attr = document.documentElement.getAttribute("data-theme");
  if (isTheme(attr)) return attr;
  try {
    const m = document.cookie.match(/(?:^|; )theme=(light|dark|system)/);
    if (m && isTheme(m[1])) return m[1];
  } catch {}
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(v)) return v;
  } catch {}
  return "system";
}
