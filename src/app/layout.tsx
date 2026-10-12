import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
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
};

export const viewport: Viewport = {
  themeColor: "#0B1846",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          {children}
          <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-inter)" } }} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
