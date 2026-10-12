import type { ThreadListItem, ThreadView } from "@/server/services/messaging";
import type { ThreadJson, ThreadListItemJson } from "./types";

export function threadToJson(t: ThreadView): ThreadJson {
  return { ...t, messages: t.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), readAt: m.readAt?.toISOString() ?? null })) };
}

export function listToJson(items: ThreadListItem[]): ThreadListItemJson[] {
  return items.map((i) => ({ ...i, last: i.last ? { ...i.last, at: i.last.at.toISOString() } : null }));
}
