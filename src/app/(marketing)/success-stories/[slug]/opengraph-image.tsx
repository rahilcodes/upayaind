import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/marketing/og/og";
import { getStory } from "@/components/marketing/data";

export const alt = "UpayaInd";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = await getStory(slug);
  return ogImage({ eyebrow: "Success story", title: e ? `${e.story.studentName}: ${e.story.role} at ${e.story.company}` : "Success stories" });
}
