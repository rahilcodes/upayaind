import { ImageResponse } from "next/og";

/** Apple touch icon: brand mark on ink (no transparency, iOS adds its own rounding). */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B1846" }}>
        <svg width="132" height="132" viewBox="0 0 34 34">
          <path d="M8 24 L14 18 L18 21 L26 11" fill="none" stroke="#0A7CF0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 11 H26 V17" fill="none" stroke="#18B8F2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
