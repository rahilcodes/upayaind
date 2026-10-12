import { getRequestConfig } from "next-intl/server";
import { loadMessages } from "./messages";

/**
 * English only at launch (SPEC §4). Every UI string goes through next-intl so
 * adding a language is a new messages folder, not a code change.
 */
export const DEFAULT_LOCALE = "en";

export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  return { locale, timeZone: "UTC", messages: await loadMessages(locale) };
});
