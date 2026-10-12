import "server-only";
import { runRenewalReminders, runSubscriptionStatusSweep } from "@/server/services/billing/renewals";
import { defineJob } from "./client";

/** F11: T-7 / T-2 renewal reminders (student + assigned employee). Daily, 13:50 UTC (morning in the US). */
export const renewalReminders = defineJob({
  id: "billing-renewal-reminders",
  cron: "50 13 * * *",
  run: async () => runRenewalReminders(),
});

/** F11: nightly status sweep (one-time plans → EXPIRED at period end, missed renewals → PAST_DUE, stale PAST_DUE → EXPIRED). */
export const subscriptionSweep = defineJob({
  id: "billing-subscription-sweep",
  cron: "20 5 * * *",
  run: async () => runSubscriptionStatusSweep(),
});
