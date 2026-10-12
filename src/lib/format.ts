import { TZDate } from "@date-fns/tz";
import { format as fmt, formatDistanceToNowStrict } from "date-fns";

/** Money is integer minor units + currency (never summed across currencies). */
export function formatMoney(amountMinor: number, currency: string, locale = "en-US") {
  const digits = minorDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: amountMinor % 10 ** digits === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / 10 ** digits);
}

export function minorDigits(currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function toMinor(amount: number, currency: string) {
  return Math.round(amount * 10 ** minorDigits(currency));
}

export function fromMinor(amountMinor: number, currency: string) {
  return amountMinor / 10 ** minorDigits(currency);
}

/** Format an instant in the viewer's zone. Patterns are date-fns tokens. */
export function formatInTz(instant: Date | string | number, tz: string, pattern = "d MMM yyyy, h:mm a") {
  return fmt(new TZDate(new Date(instant), tz), pattern);
}

export function formatDate(instant: Date | string | number, tz: string) {
  return formatInTz(instant, tz, "d MMM yyyy");
}

export function formatTime(instant: Date | string | number, tz: string) {
  return formatInTz(instant, tz, "h:mm a");
}

export function timeAgo(instant: Date | string | number) {
  return `${formatDistanceToNowStrict(new Date(instant))} ago`;
}

export function tzAbbrev(tz: string, at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

export function formatNumber(n: number, locale = "en-US") {
  return new Intl.NumberFormat(locale).format(n);
}

export function percent(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}
