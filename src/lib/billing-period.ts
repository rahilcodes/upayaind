/**
 * Pure period helpers shared by the webhook processor, the admin manual-billing
 * service and the Student 360 billing controls (D-147b). No server-only imports
 * so client components can preview a period end before submitting.
 */

export type IntervalCode = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "ONE_TIME";

/** Months of service one period of each interval grants (ONE_TIME = one month). */
export const INTERVAL_MONTHS: Record<IntervalCode, number> = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12, ONE_TIME: 1 };

export function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
}

/** Period end for a plan interval starting at `start`. */
export function periodEndFor(start: Date, interval: IntervalCode) {
  return addMonths(start, INTERVAL_MONTHS[interval]);
}
