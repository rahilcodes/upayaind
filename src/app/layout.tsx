import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { CORE_NAMESPACES, pickMessages } from "@/i18n/messages";
import { Toaster } from "sonner";
import { fraunces, inter } from "@/fonts";
import { absoluteUrl } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl("/")),
  title: { default: "UpayaInd — You’ll never apply to a job again", template: "%s · UpayaInd" },
  description:
    "Our specialists apply to 25–50 jobs for you every weekday, each with a resume tailored to the job. Track every application live.",
  applicationName: "UpayaInd",
  formatDetection: { telephone: false },
  // PWA (D-110): manifest + iOS home-screen metadata. Icons live in public/brand.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "UpayaInd", statusBarStyle: "default" },
  icons: { apple: "/brand/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0B1846",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  // Ship only shared namespaces here; marketing and portal layouts add their own.
  const messages = pickMessages(await getMessages(), CORE_NAMESPACES);
  return (
    <html lang={locale} className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-inter)" } }} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
