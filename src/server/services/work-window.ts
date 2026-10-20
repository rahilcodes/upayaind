import { TZDate } from "@date-fns/tz";
import { addDayKey, dayKey, hhmmToMinutes, weekdayOfKey } from "@/lib/dates";

/**
 * Working window maths (D-139). Pure: no DB, no "server-only", so it can be
 * unit-tested directly and shared with the admin form.
 *
 * `EmployeeProfile.workSchedule` is JSON
 * `{ days, startTime, endTime, hours, timezone?, enforceWindow? }`. Older rows
 * only have `{ days, startTime, hours }`: `endTime` is derived from start +
 * hours and vice versa. Windows may cross midnight (18:30–03:30 = 9 h).
 */

export type WorkSchedule = {
  /** ISO weekdays, 1 = Mon … 7 = Sun. */
  days: number[];
  /** "HH:mm" local to `timezone`. */
  startTime: string;
  /** "HH:mm" local to `timezone`; may be earlier than `startTime` (overnight window). */
  endTime: string;
  /** Length of the window in hours (derived from start/end). */
  hours: number;
  /** IANA zone the window is expressed in; null = the employee's own `User.timezone` (legacy rows). */
  timezone: string | null;
  /** When true, clock-in and application logging are only allowed inside the window. */
  enforceWindow: boolean;
};

export const DEFAULT_SCHEDULE: WorkSchedule = { days: [1, 2, 3, 4, 5], startTime: "09:30", endTime: "18:30", hours: 9, timezone: null, enforceWindow: false };

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 24 * 60;

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Minutes since midnight → "HH:mm" (wraps past midnight). */
export function minutesToHhmm(min: number) {
  const m = ((Math.round(min) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** Length in hours of a start→end window; end at or before start means it crosses midnight (equal = 24 h). */
export function windowHours(startTime: string, endTime: string) {
  const s = hhmmToMinutes(startTime);
  const e = hhmmToMinutes(endTime);
  const len = e > s ? e - s : e + MINUTES_PER_DAY - s;
  return Math.round((len / 60) * 100) / 100;
}

/** End time of a window from its start and length (wraps past midnight). */
export function endTimeFor(startTime: string, hours: number) {
  return minutesToHhmm(hhmmToMinutes(startTime) + hours * 60);
}

/** Normalise "9:30" → "09:30". */
const normHhmm = (v: string) => minutesToHhmm(hhmmToMinutes(v));

/**
 * Parse the stored JSON (any shape we have ever written) into a full schedule.
 * `fallbackTimezone` (the employee's `User.timezone`) is used when the window
 * has no zone of its own.
 */
export function parseSchedule(raw: unknown, fallbackTimezone?: string): WorkSchedule {
  const r = (raw ?? {}) as Partial<Record<keyof WorkSchedule, unknown>>;
  const days = Array.isArray(r.days) ? r.days.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7) : DEFAULT_SCHEDULE.days;
  const startTime = typeof r.startTime === "string" && HHMM.test(r.startTime) ? normHhmm(r.startTime) : DEFAULT_SCHEDULE.startTime;
  const storedHours = typeof r.hours === "number" && r.hours > 0 && r.hours <= 24 ? r.hours : null;
  const endTime = typeof r.endTime === "string" && HHMM.test(r.endTime) ? normHhmm(r.endTime) : endTimeFor(startTime, storedHours ?? DEFAULT_SCHEDULE.hours);
  const hours = windowHours(startTime, endTime);
  const timezone = isValidTimezone(r.timezone) ? r.timezone : isValidTimezone(fallbackTimezone) ? fallbackTimezone : null;
  return { days, startTime, endTime, hours, timezone, enforceWindow: r.enforceWindow === true };
}

/** "09:00–18:00 America/New_York" */
export function windowLabel(schedule: Pick<WorkSchedule, "startTime" | "endTime">, timezone: string) {
  return `${schedule.startTime}–${schedule.endTime} ${timezone}`;
}

/** UTC instant of "HH:mm" on a calendar day in a zone (DST-safe: built from wall-clock parts). */
export function atLocalTime(key: string, hhmm: string, tz: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(new TZDate(y!, m! - 1, d!, h ?? 0, min ?? 0, 0, tz).getTime());
}

export type WindowStatus = {
  /** `schedule.enforceWindow` */
  enforced: boolean;
  /** Is `now` inside a working window (any work day's window, including an overnight one that started yesterday)? */
  inWindow: boolean;
  /** Is today's calendar day (in the window zone) a scheduled day? */
  isWorkDay: boolean;
  /** Start of the current window when inside it, otherwise the next opening; null when there are no working days. */
  opensAt: Date | null;
  /** End of the current window when inside it, otherwise the end of the next window; null when there are no working days. */
  closesAt: Date | null;
  /** End of the most recent window that has already closed (for auto-closing sessions); null if none in range. */
  lastClosedAt: Date | null;
  /** "09:00–18:00 America/New_York" */
  label: string;
  timezone: string;
};

/**
 * Where `now` sits relative to the schedule's window, evaluated in the
 * window's own zone (never the employee's personal `User.timezone`).
 */
export function windowStatus(schedule: WorkSchedule, timezone: string, now = new Date()): WindowStatus {
  const overnight = hhmmToMinutes(schedule.endTime) <= hhmmToMinutes(schedule.startTime);
  const today = dayKey(now, timezone);
  const base: WindowStatus = {
    enforced: schedule.enforceWindow,
    inWindow: false,
    isWorkDay: schedule.days.includes(weekdayOfKey(today)),
    opensAt: null,
    closesAt: null,
    lastClosedAt: null,
    label: windowLabel(schedule, timezone),
    timezone,
  };
  if (!schedule.days.length) return base;
  // Scan a week back (last close, for auto-closing) through the next 8 days (covers a single working day per week).
  let next: { open: Date; close: Date } | null = null;
  for (let i = -7; i <= 8; i++) {
    const key = addDayKey(today, i);
    if (!schedule.days.includes(weekdayOfKey(key))) continue;
    const open = atLocalTime(key, schedule.startTime, timezone);
    const close = atLocalTime(overnight ? addDayKey(key, 1) : key, schedule.endTime, timezone);
    if (now >= open && now < close) return { ...base, inWindow: true, opensAt: open, closesAt: close, lastClosedAt: base.lastClosedAt };
    if (close <= now) base.lastClosedAt = close;
    else if (!next) next = { open, close };
  }
  return { ...base, opensAt: next?.open ?? null, closesAt: next?.close ?? null };
}
