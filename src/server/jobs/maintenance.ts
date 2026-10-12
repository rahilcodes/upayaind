import "server-only";
import { purgeDeletedUsers } from "@/server/services/admin-privacy";
import { defineJob } from "./client";

/**
 * Nightly privacy purge (SPEC §10): accounts soft-deleted more than 30 days ago
 * are anonymised; payment records and invoice PDFs are kept.
 */
export const purgeDeletedAccounts = defineJob<Record<string, never>>({
  id: "privacy-purge-deleted",
  cron: "40 2 * * *", // 02:40 UTC, quiet hours in every launch market
  run: async () => purgeDeletedUsers(),
});
