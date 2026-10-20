import { describe, expect, it } from "vitest";
import { atLocalTime, endTimeFor, parseSchedule, windowHours, windowStatus, type WorkSchedule } from "@/server/services/work-window";

// Monday 12 Oct 2026. New York is on EDT (UTC−4) until 1 Nov 2026, EST (UTC−5) after.
const NY = (hhmm: string, day = "2026-10-12") => atLocalTime(day, hhmm, "America/New_York");
const IST = (hhmm: string, day = "2026-10-12") => new Date(`${day}T${hhmm}:00+05:30`);

const nyDay: WorkSchedule = { days: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "18:00", hours: 9, timezone: "America/New_York", enforceWindow: true };
const overnight: WorkSchedule = { days: [1, 2, 3, 4, 5], startTime: "18:30", endTime: "03:30", hours: 9, timezone: "Asia/Kolkata", enforceWindow: true };

describe("parseSchedule", () => {
  it("derives endTime from the legacy start + hours shape and keeps hours", () => {
    const s = parseSchedule({ days: [1, 2, 3, 4, 5], startTime: "09:30", hours: 9 }, "Asia/Kolkata");
    expect(s).toEqual({ days: [1, 2, 3, 4, 5], startTime: "09:30", endTime: "18:30", hours: 9, timezone: "Asia/Kolkata", enforceWindow: false });
  });

  it("derives hours from start/end, including windows that cross midnight", () => {
    expect(parseSchedule({ days: [1], startTime: "18:30", endTime: "03:30" }).hours).toBe(9);
    expect(parseSchedule({ days: [1], startTime: "09:00", endTime: "18:00" }).hours).toBe(9);
    expect(parseSchedule({ days: [1], startTime: "22:00", endTime: "22:00" }).hours).toBe(24);
    expect(windowHours("09:00", "17:30")).toBe(8.5);
    expect(endTimeFor("20:00", 9)).toBe("05:00");
  });

  it("uses the window's own zone over the employee's, defaults enforceWindow to false and ignores junk", () => {
    expect(parseSchedule({ days: [1], startTime: "09:00", endTime: "18:00", timezone: "America/New_York", enforceWindow: true }, "Asia/Kolkata")).toMatchObject({ timezone: "America/New_York", enforceWindow: true });
    expect(parseSchedule({ timezone: "Mars/Olympus", enforceWindow: "yes", startTime: "9:05" }, "Asia/Kolkata")).toMatchObject({ timezone: "Asia/Kolkata", enforceWindow: false, startTime: "09:05" });
    expect(parseSchedule(null).timezone).toBeNull();
    expect(parseSchedule(null).days).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("windowStatus", () => {
  it("knows when now is inside the window and when it opens next", () => {
    const inside = windowStatus(nyDay, "America/New_York", NY("13:00"));
    expect(inside).toMatchObject({ enforced: true, inWindow: true, isWorkDay: true, label: "09:00–18:00 America/New_York" });
    expect(inside.opensAt?.toISOString()).toBe(NY("09:00").toISOString());
    expect(inside.closesAt?.toISOString()).toBe(NY("18:00").toISOString());

    const before = windowStatus(nyDay, "America/New_York", NY("06:30"));
    expect(before.inWindow).toBe(false);
    expect(before.opensAt?.toISOString()).toBe(NY("09:00").toISOString());
    expect(before.lastClosedAt?.toISOString()).toBe(NY("18:00", "2026-10-09").toISOString()); // Friday

    const after = windowStatus(nyDay, "America/New_York", NY("18:00"));
    expect(after.inWindow).toBe(false);
    expect(after.opensAt?.toISOString()).toBe(NY("09:00", "2026-10-13").toISOString());
    expect(after.lastClosedAt?.toISOString()).toBe(NY("18:00").toISOString());
  });

  it("skips non-working days: Friday evening opens next Monday", () => {
    const fri = windowStatus(nyDay, "America/New_York", NY("20:00", "2026-10-16"));
    expect(fri.inWindow).toBe(false);
    expect(fri.opensAt?.toISOString()).toBe(NY("09:00", "2026-10-19").toISOString());
    const sat = windowStatus(nyDay, "America/New_York", NY("12:00", "2026-10-17"));
    expect(sat).toMatchObject({ inWindow: false, isWorkDay: false });
  });

  it("handles overnight windows (18:30–03:30 IST)", () => {
    // Tuesday 01:00 IST is inside Monday's window.
    const early = windowStatus(overnight, "Asia/Kolkata", IST("01:00", "2026-10-13"));
    expect(early.inWindow).toBe(true);
    expect(early.opensAt?.toISOString()).toBe(IST("18:30").toISOString());
    expect(early.closesAt?.toISOString()).toBe(IST("03:30", "2026-10-13").toISOString());
    // Tuesday 04:00 IST: closed; next opening Tuesday 18:30.
    const gap = windowStatus(overnight, "Asia/Kolkata", IST("04:00", "2026-10-13"));
    expect(gap.inWindow).toBe(false);
    expect(gap.lastClosedAt?.toISOString()).toBe(IST("03:30", "2026-10-13").toISOString());
    expect(gap.opensAt?.toISOString()).toBe(IST("18:30", "2026-10-13").toISOString());
    // Saturday 02:00 IST is still inside Friday's window.
    expect(windowStatus(overnight, "Asia/Kolkata", IST("02:00", "2026-10-17")).inWindow).toBe(true);
  });

  it("is DST-safe: 09:00 New York is 13:00Z in October and 14:00Z in November", () => {
    expect(NY("09:00", "2026-10-12").toISOString()).toBe("2026-10-12T13:00:00.000Z");
    expect(NY("09:00", "2026-11-02").toISOString()).toBe("2026-11-02T14:00:00.000Z");
    const nov = windowStatus(nyDay, "America/New_York", new Date("2026-11-02T13:30:00Z")); // 08:30 EST
    expect(nov.inWindow).toBe(false);
    expect(nov.opensAt?.toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("evaluates in the window's zone, not the employee's, and reports enforced=false when off", () => {
    const relaxed = { ...nyDay, enforceWindow: false };
    expect(windowStatus(relaxed, "America/New_York", NY("06:30"))).toMatchObject({ enforced: false, inWindow: false });
    // 13:00 New York is 22:30 IST — still "in window" because the window lives in New York time.
    expect(windowStatus(nyDay, "America/New_York", IST("22:30")).inWindow).toBe(true);
  });

  it("returns nulls when no working days are set", () => {
    expect(windowStatus({ ...nyDay, days: [] }, "America/New_York", NY("13:00"))).toMatchObject({ inWindow: false, isWorkDay: false, opensAt: null, closesAt: null, lastClosedAt: null });
  });
});
