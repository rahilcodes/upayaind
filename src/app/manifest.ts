import type { MetadataRoute } from "next";

/** Web app manifest (D-110): installable student portal. Icons generated from public/brand/upayaind-mark.png. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UpayaInd — Job applications done for you",
    short_name: "UpayaInd",
    description: "Track every application our specialists send for you, your interviews and your resume versions.",
    id: "/app",
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5F8FE",
    theme_color: "#2563DE",
    lang: "en",
    categories: ["productivity", "business"],
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/brand/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Applications", url: "/app/applications", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
      { name: "Interviews", url: "/app/interviews", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
      { name: "Messages", url: "/app/messages", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
