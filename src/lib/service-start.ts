import { addDayKey, dayKey, startOfDayInTz, weekdayOfKey } from "./dates";

/**
 * Default service start date for a new plan (D-171): the setup of a new
 * applicant takes two to three days, and that time isn't billed. The plan
 * starts two calendar days after the payment (or trial sign-up), moved forward
 * to the next working day of the market when that lands on a day off:
 * Monday → Wednesday, Thursday → Monday, Friday → Monday, Saturday → Monday.
 * Returned as midday of that day in the market's time zone, so the calendar date reads the same
 * for a student or admin a few time zones away. Pure.
 */
export const SETUP_DAYS = 2;

export function defaultServiceStart(paidAt: Date, timezone: string, workingDays: readonly number[] = [1, 2, 3, 4, 5]): Date {
  const days = workingDays.length ? workingDays : [1, 2, 3, 4, 5];
  let key = addDayKey(dayKey(paidAt, timezone), SETUP_DAYS);
  for (let i = 0; i < 7 && !days.includes(weekdayOfKey(key)); i++) key = addDayKey(key, 1);
  return new Date(startOfDayInTz(key, timezone).getTime() + 12 * 3_600_000);
}

/** Add whole days to an instant (trial length). */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
