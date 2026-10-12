import { TZDate } from "@date-fns/tz";
import { addDays, differenceInCalendarDays, format } from "date-fns";

/**
 * Time-zone helpers. Everything is stored in UTC; "days" (targets, attendance)
 * are calendar days in a specific zone (SPEC §12, F10).
 */

/** Calendar day key ("2026-10-12") of an instant in a zone. */
export function dayKey(instant: Date, tz: string): string {
  return format(new TZDate(instant, tz), "yyyy-MM-dd");
}

/** ISO weekday (1 = Mon … 7 = Sun) of an instant in a zone. */
export function isoWeekday(instant: Date, tz: string): number {
  const d = new TZDate(instant, tz).getDay();
  return d === 0 ? 7 : d;
}

/** UTC instant at which the given calendar day starts in `tz`. */
export function startOfDayInTz(key: string, tz: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(new TZDate(y!, m! - 1, d!, 0, 0, 0, tz).getTime());
}

/** [start, end) UTC instants for the calendar day containing `instant` in `tz`. */
export function dayRangeInTz(instant: Date, tz: string): { start: Date; end: Date; key: string } {
  const key = dayKey(instant, tz);
  const start = startOfDayInTz(key, tz);
  const end = startOfDayInTz(addDayKey(key, 1), tz);
  return { start, end, key };
}

/** A `@db.Date` value for a day key (UTC midnight). */
export function dateOnly(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function keyFromDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDayKey(key: string, days: number): string {
  return addDays(dateOnly(key), days).toISOString().slice(0, 10);
}

export function weekdayOfKey(key: string): number {
  const d = dateOnly(key).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Inclusive list of day keys. */
export function eachDayKey(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  const n = differenceInCalendarDays(dateOnly(toKey), dateOnly(fromKey));
  for (let i = 0; i <= n; i++) out.push(addDayKey(fromKey, i));
  return out;
}

/** Minutes elapsed since the start of the local day (for pro-rating targets). */
export function minutesIntoDay(instant: Date, tz: string): number {
  const z = new TZDate(instant, tz);
  return z.getHours() * 60 + z.getMinutes();
}

/** Parse "HH:mm" into minutes. */
export function hhmmToMinutes(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
