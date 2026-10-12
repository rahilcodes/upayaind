import { tzAbbrev } from "@/lib/format";

/** Common abbreviations Intl (en-US) doesn't produce, e.g. Asia/Kolkata → "IST" instead of "GMT+5:30". */
const NAMED: Record<string, string> = { "Asia/Kolkata": "IST", "Asia/Calcutta": "IST", "Asia/Dubai": "GST", "Asia/Singapore": "SGT" };

export function tzLabel(tz: string, at = new Date()) {
  return NAMED[tz] ?? tzAbbrev(tz, at);
}
