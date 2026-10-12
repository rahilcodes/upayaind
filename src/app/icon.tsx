import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/** Site icon: the logo's figure-and-swoosh mark on white. */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  const mark = await fs.readFile(path.join(process.cwd(), "public/brand/upayaind-mark.png"));
  const src = `data:image/png;base64,${mark.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF", borderRadius: 16 }}>
        { }
        <img src={src} width={55} height={55} alt="" />
      </div>
    ),
    size,
  );
}
