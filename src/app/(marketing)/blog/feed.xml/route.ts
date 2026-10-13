import { absoluteUrl } from "@/lib/utils";
import { htmlToText } from "@/components/marketing/data";
import { listPublished, mediaUrl } from "@/server/services/cms";
import { buildRss, toFeedPost } from "@/server/services/blog";

/** RSS 2.0 feed of published blog posts (DECISIONS D-134). Static + ISR like the blog. */
export const revalidate = 3600;

export async function GET() {
  const posts = await listPublished("BLOG", { order: "recent", take: 50 });
  const xml = buildRss(
    posts.map((e) => toFeedPost(e, { text: htmlToText(e.bodyHtml), image: e.ogImageKey ? absoluteUrl(mediaUrl(e.ogImageKey)) : undefined })),
    { siteUrl: absoluteUrl("/"), title: "UpayaInd Blog", description: "Practical advice on resumes, applications and interviews from the UpayaInd team.", feedPath: "/blog/feed.xml" },
  );
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } });
}
