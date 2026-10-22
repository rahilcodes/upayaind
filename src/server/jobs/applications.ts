import "server-only";
import { runNoResponseSweep, runTestimonialRequests } from "@/server/services/applications";
import { runInterviewReminders } from "@/server/services/interview-reminders";
import { endExpiredCovers } from "@/server/services/assignment";
import { defineJob } from "./client";

/**
 * Application lifecycle jobs (SPEC F5).
 * - nightly NO_RESPONSE sweep: APPLIED/VIEWED older than settings.noResponseDays.
 * - daily testimonial requests 7 days after OFFER/HIRED (one per student/application).
 * - hourly interview reminders 24 h and 1 h before (student + specialist; D-103).
 */

export const noResponseJob = defineJob({
  id: "applications-no-response",
  cron: "30 6 * * *", // 06:30 UTC ≈ after US midnight
  run: async () => runNoResponseSweep(),
});

export const testimonialRequestJob = defineJob({
  id: "applications-testimonial-request",
  cron: "0 15 * * *", // 15:00 UTC = morning in the US
  run: async () => runTestimonialRequests(),
});

export const interviewReminderJob = defineJob({
  id: "applications-interview-reminders",
  cron: "5 * * * *", // hourly; the service's windows (≤ 90 min / ≤ 24 h) tolerate an hourly cadence
  run: async () => {
    const reminders = await runInterviewReminders();
    // Same hourly tick closes COVER assignments whose leave window has ended (D-144).
    const coversEnded = await endExpiredCovers();
    return { ...reminders, coversEnded };
  },
});
