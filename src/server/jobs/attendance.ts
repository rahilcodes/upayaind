import "server-only";
import { runAttendanceRollup } from "@/server/services/attendance";
import { runBelowTargetAlerts, runStudentDayRollup } from "@/server/services/targets";
import { defineJob } from "./client";

/**
 * Employee workday jobs (SPEC F8 / F10). All are hourly because "night" and
 * "3 pm" are per employee timezone; each run checks the local time itself.
 * - attendance-rollup: auto-close forgotten sessions (last ping + 5 min) and
 *   roll up yesterday's EmployeeDay shortly after each employee's midnight.
 * - student-day-rollup: recount StudentDay (yesterday + today) per student.
 * - below-target-alert: at settings.belowTargetAlertTime in each employee's tz.
 */

export const attendanceRollupJob = defineJob({
  id: "attendance-rollup",
  cron: "5 * * * *",
  run: async () => runAttendanceRollup(),
});

export const studentDayRollupJob = defineJob({
  id: "student-day-rollup",
  cron: "15 * * * *",
  run: async () => runStudentDayRollup(),
});

export const belowTargetAlertJob = defineJob({
  id: "below-target-alert",
  cron: "1 * * * *",
  run: async () => runBelowTargetAlerts(),
});
