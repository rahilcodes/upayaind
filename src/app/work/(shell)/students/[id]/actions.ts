"use server";
import { z } from "zod";
import { requireStaff } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { requestMeta } from "@/server/request";
import { revealCredential, REVEAL_ACTIONS, type RevealAction } from "@/server/services/vault";

/** Reveal / copy a vault login (assigned employee only; every call is logged by the vault service). */
export async function revealCredentialAction(credentialId: string, action: RevealAction) {
  return safeAction(async () => {
    const { user } = await requireStaff(["EMPLOYEE"]);
    const v = z.object({ id: z.string().min(1).max(64), action: z.enum(REVEAL_ACTIONS as [RevealAction, ...RevealAction[]]) }).parse({ id: credentialId, action });
    const meta = await requestMeta().catch(() => ({ ip: null }));
    return revealCredential(user, v.id, v.action, meta.ip);
  });
}
