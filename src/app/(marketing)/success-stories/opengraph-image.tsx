import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/marketing/og/og";

export const alt = "UpayaInd — Students who got hired";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ eyebrow: "Success stories", title: "Students who got hired" });
}
