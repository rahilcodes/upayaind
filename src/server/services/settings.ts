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
  /** Public website: contact details and the headline results on the homepage proof strip (D-142). */
  publicSite: { contactEmail: string; offices: Record<string, string>; stats: { placed: string; interviews: string; applications: string } };
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
  publicSite: {
    contactEmail: "contact@upayaind.com",
    offices: { US: "502 W 7th St, Ste 100, Erie, PA 16052, USA", IN: "B 609, B-Block, Asian Sun City, Kothaguda X Road, Kondapur, Hyderabad, Telangana 500084, India" },
    stats: { placed: "60+", interviews: "800+", applications: "7000+" },
  },
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
