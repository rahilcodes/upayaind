import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/** Site icon: the logo's figure-and-swoosh mark on white. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function Icon() {
  const mark = await fs.readFile(path.join(process.cwd(), "public/brand/upayaind-mark.png"));
  const src = `data:image/png;base64,${mark.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF", borderRadius: 0 }}>
        { }
        <img src={src} width={155} height={155} alt="" />
      </div>
    ),
    size,
  );
}
