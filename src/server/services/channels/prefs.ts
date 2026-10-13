import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { integrations } from "@/env";
import { toWhatsAppAddress } from "./whatsapp-twilio";
import type { NotificationPrefs } from "../notify";

/**
 * WhatsApp opt-in (DECISIONS D-133): stored as `User.notificationPrefs.whatsapp`
 * next to the email preferences; requires an E.164 phone on the profile.
 */
export async function getWhatsAppPref(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { phone: true, notificationPrefs: true } });
  const prefs = (u?.notificationPrefs ?? {}) as NotificationPrefs;
  const phone = u?.phone ?? null;
  return { enabled: prefs.whatsapp === true, phone, phoneValid: Boolean(toWhatsAppAddress(phone)), available: integrations.whatsapp };
}

export async function setWhatsAppPref(userId: string, enabled: boolean) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { phone: true, notificationPrefs: true } });
  if (enabled && !toWhatsAppAddress(u?.phone)) throw new Error("Add a phone number with country code to your profile first.");
  const prev = (u?.notificationPrefs ?? {}) as NotificationPrefs & Record<string, unknown>;
  const next = { ...prev, whatsapp: enabled };
  await db.user.update({ where: { id: userId }, data: { notificationPrefs: next as Prisma.InputJsonValue } });
  return { enabled };
}
