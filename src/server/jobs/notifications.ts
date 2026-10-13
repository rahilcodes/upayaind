import "server-only";
import { runCredentialAccessDigest } from "@/server/services/vault";
import { runDailyDigest, runWeeklyReports } from "@/server/services/student-reports";
import { defineJob } from "./client";

/**
 * Notification jobs owned by the student area.
 *
 * credential-access-digest (SPEC §10): once a day the student gets one email
 * summarising which staff member viewed/copied which saved login the previous
 * day (their time zone). Runs 13:05 UTC (≈ 9 AM US Eastern), after midnight in
 * every US zone, so "yesterday" is complete for all launch-market students.
 *
 * student-daily-digest (F13, D-112): hourly; sends `daily_digest` to students
 * whose local time is 19:xx on a working day with ≥ 1 application logged today.
 * student-weekly-report (F13, D-112): hourly; Monday 09:xx local → branded PDF
 * report to students and `weekly_summary_admin` to managers. Both idempotent
 * (StudentProfile.lastDigestKey / lastWeeklyReportKey).
 */
export const credentialAccessDigest = defineJob({
  id: "credential-access-digest",
  cron: "5 13 * * *",
  run: async () => runCredentialAccessDigest(),
});

export const studentDailyDigest = defineJob({
  id: "student-daily-digest",
  cron: "7 * * * *",
  run: async () => runDailyDigest(),
});

export const studentWeeklyReport = defineJob({
  id: "student-weekly-report",
  cron: "11 * * * *",
  run: async () => runWeeklyReports(),
});
