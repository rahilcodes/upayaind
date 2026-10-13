import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

/** Typed admin settings (SPEC §11 Settings) with defaults. */
export type Settings = {
  autoAssignEnabled: boolean;
  defaultMaxStudents: number;
  noResponseDays: number;
  belowTargetAlertTime: string; // "HH:mm" in employee tz
  aiLimits: { employeePerHour: number; studentPerDay: number };
  business: Record<string, { legalName: string; address: string; taxId: string }>;
  notificationTemplates?: Record<string, { subject?: string; heading?: string; body?: string }>;
  /** Referral programme (D-113): friend's first-payment discount and the referrer's credit per currency (minor units). */
  referral: { friendPercentOff: number; referrerCreditMinor: Record<string, number> };
  /** Outgoing Slack/Teams-compatible webhooks (D-122). */
  alertWebhooks?: { id: string; url: string; label: string; events: string[]; enabled: boolean }[];
};

export const DEFAULT_SETTINGS: Settings = {
  autoAssignEnabled: true,
  defaultMaxStudents: 8,
  noResponseDays: 30,
  belowTargetAlertTime: "15:00",
  aiLimits: { employeePerHour: 60, studentPerDay: 300 },
  business: {},
  notificationTemplates: {},
  referral: { friendPercentOff: 10, referrerCreditMinor: { USD: 2500, CAD: 3000, GBP: 2000, AUD: 3500, INR: 150000 } },
  alertWebhooks: [],
};

export async function getSettings(): Promise<Settings> {
  const rows = await db.setting.findMany();
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  return (row?.value as Settings[K] | undefined) ?? DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db.setting.upsert({
    where: { key },
    update: { value: value as Prisma.InputJsonValue },
    create: { key, value: value as Prisma.InputJsonValue },
  });
}
