import "server-only";
import { runCredentialAccessDigest } from "@/server/services/vault";
import { defineJob } from "./client";

/**
 * Notification jobs owned by the student area.
 *
 * credential-access-digest (SPEC §10): once a day the student gets one email
 * summarising which staff member viewed/copied which saved login the previous
 * day (their time zone). Runs 13:05 UTC (≈ 9 AM US Eastern), after midnight in
 * every US zone, so "yesterday" is complete for all launch-market students.
 */
export const credentialAccessDigest = defineJob({
  id: "credential-access-digest",
  cron: "5 13 * * *",
  run: async () => runCredentialAccessDigest(),
});
