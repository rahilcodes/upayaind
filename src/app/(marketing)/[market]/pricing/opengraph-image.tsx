import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/marketing/og/og";
import { marketForSegment } from "@/lib/market";

export const alt = "UpayaInd plans and pricing";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const WHERE: Record<string, string> = { IN: "India", UK: "the UK", CA: "Canada", AU: "Australia", NZ: "New Zealand" };

export default async function Image({ params }: { params: Promise<{ market: string }> }) {
  const market = marketForSegment((await params).market);
  return ogImage({ eyebrow: "Plans and pricing", title: market ? `Job application service pricing in ${WHERE[market]}` : "Plans and pricing" });
}
