import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/marketing/og/og";

export const alt = "UpayaInd — Questions, answered";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ eyebrow: "FAQ", title: "Questions, answered" });
}
