import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/marketing/og/og";
import { getPublished } from "@/server/services/cms";

export const alt = "UpayaInd";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ audience: string }> }) {
  const { audience } = await params;
  const e = await getPublished("LANDING", audience);
  return ogImage({ eyebrow: "Done-for-you job applications", title: e ? `UpayaInd for ${e.title}` : "UpayaInd" });
}
