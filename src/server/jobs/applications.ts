import "server-only";
import { runNoResponseSweep, runTestimonialRequests } from "@/server/services/applications";
import { defineJob } from "./client";

/**
 * Application lifecycle jobs (SPEC F5).
 * - nightly NO_RESPONSE sweep: APPLIED/VIEWED older than settings.noResponseDays.
 * - daily testimonial requests 7 days after OFFER/HIRED (one per student/application).
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
