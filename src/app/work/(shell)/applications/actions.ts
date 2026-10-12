"use server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireStaff } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { bulkUpdateStatus, TRANSITIONS } from "@/server/services/applications";

const BulkInput = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1, "Select at least one application.").max(100),
  to: z.enum(Object.keys(TRANSITIONS) as [string, ...string[]]),
  note: z.string().trim().max(2000).optional().nullable(),
});

/** Bulk status change (F5). Each application is validated independently. */
export async function bulkStatusAction(ids: string[], to: string, note?: string | null) {
  const t = await getTranslations("work.applications.bulk");
  return safeAction(async () => {
    const { user } = await requireStaff();
    const v = BulkInput.parse({ ids, to, note });
    if (v.to === "INTERVIEW_SCHEDULED") throw new z.ZodError([{ code: "custom", message: t("noInterviewBulk"), path: ["to"], input: v.to }]);
    const results = await bulkUpdateStatus(user, v.ids, v.to as never, v.note);
    return { ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).map((r) => ({ id: r.id, error: r.error ?? "" })) };
  });
}
