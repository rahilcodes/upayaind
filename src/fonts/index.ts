import localFont from "next/font/local";

/** Self-hosted variable fonts (SPEC §13: Fraunces display + Inter UI). */
export const inter = localFont({
  src: [
    { path: "./inter-latin.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-inter",
  // "optional": no late re-render when the font arrives (better LCP on slow mobile); metric-adjusted fallback avoids layout shift.
  display: "optional",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

export const fraunces = localFont({
  // Subset to Basic Latin + common punctuation, weights 500–700, optical size 48–144 (display use only).
  src: [{ path: "./fraunces-display.woff2", weight: "500 700", style: "normal" }],
  variable: "--font-fraunces",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});
