import { beforeEach, describe, expect, it, vi } from "vitest";

const { notifyManagers } = vi.hoisted(() => ({ notifyManagers: vi.fn(async (..._args: unknown[]) => undefined) }));
vi.mock("@/server/services/notify", () => ({ notifyManagers }));

import { db } from "@/server/db";
import { devOutbox } from "@/server/services/email";
import { contactSchema, submitContact } from "@/server/services/leads";
import { RateLimitError } from "@/server/services/ratelimit";
import { resetDb } from "../setup/db";

const valid = {
  name: "Priya Sharma",
  email: "Priya@Example.com",
  phoneCountry: "US",
  phone: "(415) 555-2671",
  market: "us",
  message: "I'd like to know how it works.",
  consent: "on" as const,
  website: "",
  utm: "utm_source=google&utm_campaign=launch&x=1",
};

let ipN = 0;
const ip = () => `203.0.113.${++ipN}`;

describe("contact form validation", () => {
  it("accepts a valid submission and normalises fields", () => {
    const r = contactSchema.parse(valid);
    expect(r.email).toBe("priya@example.com");
    expect(r.market).toBe("US");
    expect(r.phone).toBe("+14155552671");
  });

  it("phone is optional but must be valid when given (with country code)", () => {
    expect(contactSchema.parse({ ...valid, phone: "" }).phone).toBeNull();
    expect(contactSchema.parse({ ...valid, phoneCountry: "IN", phone: "079970 01700" }).phone).toBe("+917997001700");
    expect(contactSchema.parse({ ...valid, phoneCountry: "US", phone: "+44 20 7946 0958" }).phone).toBe("+442079460958");
    expect(contactSchema.safeParse({ ...valid, phone: "12" }).success).toBe(false);
  });

  it.each([
    ["name", { name: "A" }],
    ["email", { email: "not-an-email" }],
    ["message", { message: "too short" }],
    ["consent", { consent: "" }],
    ["market", { market: "USA" }],
  ])("rejects invalid %s", (field, patch) => {
    const r = contactSchema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.path[0]).toBe(field);
  });

  it("message must be at least 10 characters after trimming", () => {
    expect(contactSchema.safeParse({ ...valid, message: "  123456789  " }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, message: "1234567890" }).success).toBe(true);
  });
});

describe("submitContact", () => {
  beforeEach(async () => {
    await resetDb();
    notifyManagers.mockClear();
    devOutbox.length = 0;
  });

  it("creates a Lead, sends the auto-reply and notifies managers", async () => {
    const r = await submitContact(valid, { ip: ip() });
    expect(r.spam).toBe(false);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: r.id! } });
    expect(lead).toMatchObject({ name: "Priya Sharma", email: "priya@example.com", phone: "+14155552671", marketCode: "US", source: "CONTACT_FORM", status: "NEW" });
    expect(lead.utm).toEqual({ utm_source: "google", utm_campaign: "launch" });
    expect(devOutbox.some((m) => m.to === "priya@example.com")).toBe(true);
    expect(notifyManagers).toHaveBeenCalledWith("new_lead", expect.objectContaining({ email: "priya@example.com" }));
    expect(await db.productEvent.count({ where: { name: "contact_submitted" } })).toBe(1);
  });

  it("honeypot submissions are accepted silently but store nothing", async () => {
    const r = await submitContact({ ...valid, website: "http://spam.test" }, { ip: ip() });
    expect(r.spam).toBe(true);
    expect(await db.lead.count()).toBe(0);
    expect(notifyManagers).not.toHaveBeenCalled();
    expect(devOutbox).toHaveLength(0);
  });

  it("rate limits to 5 per hour per IP", async () => {
    const addr = ip();
    for (let i = 0; i < 5; i++) await submitContact({ ...valid, email: `p${i}@example.com` }, { ip: addr });
    await expect(submitContact(valid, { ip: addr })).rejects.toBeInstanceOf(RateLimitError);
    expect(await db.lead.count()).toBe(5);
    // Another IP is unaffected.
    await expect(submitContact(valid, { ip: ip() })).resolves.toMatchObject({ spam: false });
  });

  it("invalid input never reaches the database", async () => {
    await expect(submitContact({ ...valid, message: "short" }, { ip: ip() })).rejects.toThrow();
    expect(await db.lead.count()).toBe(0);
  });
});
