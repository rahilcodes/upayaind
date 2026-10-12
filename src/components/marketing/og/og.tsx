import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Generated Open Graph images (SPEC §6.1). Fonts are static instances of the
 * self-hosted Fraunces/Inter (OFL, see src/fonts/LICENSE.txt), read from disk —
 * no network access needed at build or request time.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const DIR = path.join(process.cwd(), "src/components/marketing/og");
let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 600 | 700; style: "normal" }[]> | null = null;

function loadFonts() {
  fonts ??= Promise.all([
    fs.readFile(path.join(DIR, "fraunces-600.ttf")).then((data) => ({ name: "Fraunces", data, weight: 600 as const, style: "normal" as const })),
    fs.readFile(path.join(DIR, "inter-500.ttf")).then((data) => ({ name: "Inter", data, weight: 500 as const, style: "normal" as const })),
    fs.readFile(path.join(DIR, "inter-700.ttf")).then((data) => ({ name: "Inter", data, weight: 700 as const, style: "normal" as const })),
  ]);
  return fonts;
}

function Mark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34">
      <defs>
        <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0A35D6" />
          <stop offset="0.5" stopColor="#0A7CF0" />
          <stop offset="1" stopColor="#18B8F2" />
        </linearGradient>
      </defs>
      <rect width="34" height="34" rx="9" fill="#FFFFFF" />
      <path d="M8 24 L14 18 L18 21 L26 11" fill="none" stroke="url(#g)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 11 H26 V17" fill="none" stroke="#18B8F2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Navy card with the rising-arrow motif, an eyebrow, a Fraunces title and a footer line. */
export async function ogImage({ eyebrow, title, footer = "upayaind.com" }: { eyebrow?: string; title: string; footer?: string }) {
  const t = title.length > 110 ? `${title.slice(0, 107)}…` : title;
  const fontSize = t.length > 70 ? 56 : t.length > 40 ? 66 : 76;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0B1846", padding: "64px 72px", position: "relative", fontFamily: "Inter" }}>
        <svg width="760" height="380" viewBox="0 0 520 260" style={{ position: "absolute", right: -80, bottom: -70, opacity: 0.35 }}>
          <path d="M10 240 L170 140 L270 190 L500 30" fill="none" stroke="#18B8F2" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M420 30 H500 V110" fill="none" stroke="#18B8F2" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 10, background: "linear-gradient(90deg, #0A35D6, #0A7CF0, #18B8F2)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Mark size={60} />
          <span style={{ fontFamily: "Fraunces", fontSize: 40, color: "#FFFFFF", letterSpacing: -0.5 }}>UpayaInd</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 940 }}>
          {eyebrow ? <span style={{ fontSize: 26, fontWeight: 700, color: "#8FD8F7", letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 20 }}>{eyebrow}</span> : null}
          <span style={{ fontFamily: "Fraunces", fontSize, lineHeight: 1.06, color: "#FFFFFF", letterSpacing: -1.5 }}>{t}</span>
        </div>
        <span style={{ fontSize: 26, fontWeight: 500, color: "#B9C3E3" }}>{footer}</span>
      </div>
    ),
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}
