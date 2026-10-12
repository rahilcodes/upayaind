import { ImageResponse } from "next/og";

/** Brand mark (rising arrow on ink) as the site icon. */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B1846", borderRadius: 16 }}>
        <svg width="52" height="52" viewBox="0 0 34 34">
          <path d="M8 24 L14 18 L18 21 L26 11" fill="none" stroke="#0A7CF0" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 11 H26 V17" fill="none" stroke="#18B8F2" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
