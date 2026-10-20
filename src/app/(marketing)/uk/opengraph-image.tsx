import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/marketing/og/og";

export const alt = "UpayaInd UK — You’ll never fill in another application form.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ eyebrow: "Done-for-you job applications in the UK", title: "You’ll never fill in another application form." });
}
