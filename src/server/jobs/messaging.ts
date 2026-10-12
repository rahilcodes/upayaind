import "server-only";
import { runUnreadEmails } from "@/server/services/messaging";
import { defineJob } from "./client";

/**
 * F7: email a message's recipient when it's still unread after 10 minutes.
 * A cron scan (every 5 min) instead of one delayed job per message: messages are
 * claimed with `emailedAt`, so each is emailed at most once (D-073).
 */
export const unreadMessageEmailJob = defineJob({
  id: "messages-unread-email",
  cron: "*/5 * * * *",
  run: async () => runUnreadEmails(),
});
