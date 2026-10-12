import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

/** Portal-area client components need their namespaces (the root layout only ships shared ones). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider messages={await getMessages()}>{children}</NextIntlClientProvider>;
}
