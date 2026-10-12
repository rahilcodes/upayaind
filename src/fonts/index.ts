import localFont from "next/font/local";

/** Self-hosted variable fonts (SPEC §13: Fraunces display + Inter UI). */
export const inter = localFont({
  src: [
    { path: "./inter-latin.woff2", weight: "100 900", style: "normal" },
    { path: "./inter-latin-ext.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

export const fraunces = localFont({
  src: [{ path: "./fraunces-latin.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-fraunces",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});
