import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/marketing/og/og";

export const alt = "UpayaInd — Job search, done smarter";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ eyebrow: "Blog", title: "Job search, done smarter" });
}
