"use server";
import { requireStudent } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { createPortalSession } from "@/server/services/billing";

/** Stripe customer portal (upgrade/downgrade/cancel/payment method). Webhooks sync changes back. */
export async function openPortalAction() {
  return safeAction(async () => {
    const { student } = await requireStudent();
    return createPortalSession(student.id);
  });
}
