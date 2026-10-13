import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/utils";

/** Advertises the RSS/Atom feeds on every blog page (DECISIONS D-134). */
export const metadata: Metadata = {
  alternates: {
    types: {
      "application/rss+xml": [{ url: absoluteUrl("/blog/feed.xml"), title: "UpayaInd Blog (RSS)" }],
      "application/atom+xml": [{ url: absoluteUrl("/blog/atom.xml"), title: "UpayaInd Blog (Atom)" }],
    },
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
