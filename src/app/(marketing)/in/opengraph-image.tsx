import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/marketing/og/og";

export const alt = "UpayaInd India — Stop applying. Start interviewing.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ eyebrow: "Done-for-you job applications in India", title: "Stop applying. Start interviewing." });
}
