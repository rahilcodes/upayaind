import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addMonthsUtc, cohortRetention, resolveRange, revenueReport, roleFamily } from "@/server/services/reports";
import { safeCsvCell, toCsv, toXlsx } from "@/server/services/admin-export";
import { makeMarket, makeStudent, resetDb } from "../setup/db";

beforeEach(async () => {
  await resetDb();
});

describe("pure report helpers", () => {
  it("derives the role family from the first target title keyword", () => {
    expect(roleFamily(["Senior Data Analyst", "BI Developer"])).toBe("data");
    expect(roleFamily(["Software Engineer"])).toBe("software");
    expect(roleFamily(["Sr. Product Manager"])).toBe("sr.");
    expect(roleFamily([])).toBe("unspecified");
  });
  it("adds months with month-end clamping", () => {
    expect(addMonthsUtc(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
  });
  it("computes retention cohorts and leaves future horizons empty", () => {
    const now = new Date("2026-05-15T00:00:00Z");
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    const rows = cohortRetention(
      [
        { firstPaidAt: d("2026-01-10"), paidThrough: d("2026-04-10") },
        { firstPaidAt: d("2026-01-20"), paidThrough: d("2026-02-20") },
        { firstPaidAt: d("2026-04-01"), paidThrough: d("2026-05-01") },
      ],
      now,
    );
    expect(rows).toEqual([
      { cohort: "2026-01", size: 2, retention: [100, 50, 50] },
      { cohort: "2026-04", size: 1, retention: [100, null, null] },
    ]);
  });
  it("defaults to the last 30 days", () => {
    const r = resolveRange({}, "UTC", new Date("2026-10-12T10:00:00Z"));
    expect(r.fromKey).toBe("2026-09-13");
    expect(r.toKey).toBe("2026-10-12");
  });
});

describe("revenue report", () => {
  it("groups per month and currency without mixing currencies", async () => {
    const us = await makeMarket("US");
    const s = await makeStudent(us.id);
    const paidAt = new Date();
    await db.payment.createMany({
      data: [
        { studentId: s.student.id, amountMinor: 10000, currency: "USD", status: "SUCCEEDED", provider: "MANUAL", paidAt },
        { studentId: s.student.id, amountMinor: 5000, currency: "USD", status: "PARTIALLY_REFUNDED", refundedMinor: 1000, provider: "MANUAL", paidAt },
        { studentId: s.student.id, amountMinor: 700000, currency: "INR", status: "SUCCEEDED", provider: "MANUAL", paidAt },
        { studentId: s.student.id, amountMinor: 9999, currency: "USD", status: "FAILED", provider: "MANUAL", paidAt },
      ],
    });
    const t = await revenueReport(resolveRange({}, "UTC"));
    expect(t.rows).toHaveLength(2);
    const usd = t.rows.find((r) => r.currency === "USD")!;
    expect(usd).toMatchObject({ payments: 2, gross: 15000, refunded: 1000, net: 14000 });
    expect(t.rows.find((r) => r.currency === "INR")).toMatchObject({ gross: 700000, net: 700000 });
  });
});

describe("exports", () => {
  const sheet = {
    title: "Revenue",
    columns: [
      { key: "month", type: "text" as const, label: "Month" },
      { key: "currency", type: "text" as const, label: "Currency" },
      { key: "net", type: "money" as const, label: "Net" },
    ],
    rows: [
      { month: "2026-10", currency: "USD", net: 12345 },
      { month: "=cmd()", currency: "JPY", net: 500 },
    ],
  };
  it("writes CSV in major units of each row's currency and neutralises formulas", () => {
    const csv = toCsv(sheet);
    expect(csv).toContain("2026-10,USD,123.45");
    expect(csv).toContain("'=cmd(),JPY,500");
    expect(safeCsvCell("+1")).toBe("'+1");
  });
  it("writes a valid XLSX", async () => {
    const buf = await toXlsx(sheet);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});

describe("report labels", () => {
  it("every report column and tab has an admin.json label", async () => {
    const { runReport, REPORT_KEYS } = await import("@/server/services/reports");
    const msgs = (await import("@/i18n/messages/en/admin.json")).default as { admin: { reports: { cols: Record<string, string>; tabs: Record<string, string>; help: Record<string, string> } } };
    const r = resolveRange({}, "UTC");
    for (const k of REPORT_KEYS) {
      const t = await runReport(k, r);
      expect(msgs.admin.reports.tabs[k], k).toBeTruthy();
      expect(msgs.admin.reports.help[k], k).toBeTruthy();
      for (const c of t.columns) expect(msgs.admin.reports.cols[c.key], `${k}.${c.key}`).toBeTruthy();
    }
  });
});
