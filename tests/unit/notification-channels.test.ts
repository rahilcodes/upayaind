import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { integrations } from "@/env";
import { notify, WHATSAPP_TYPES } from "@/server/services/notify";
import { renderPlainText, toWhatsAppAddress, whatsappChannel } from "@/server/services/channels";
import { getWhatsAppPref, setWhatsAppPref } from "@/server/services/channels/prefs";
import { makeMarket, makeStudent, resetDb } from "../setup/db";

const sendEmail = vi.fn(async (..._args: unknown[]) => ({ id: "email_1" }));
vi.mock("@/server/services/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

// Twilio credentials present; `integrations.whatsapp` is toggled per test.
vi.mock("@/env", async (orig) => {
  const m = (await orig()) as { env: Record<string, unknown>; integrations: Record<string, boolean> };
  return {
    ...m,
    env: { ...m.env, TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "secret", TWILIO_WHATSAPP_FROM: "+14155238886" },
    integrations: { ...m.integrations, whatsapp: true },
  };
});

const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ sid: "SM123" }), { status: 201, headers: { "content-type": "application/json" } }));

beforeEach(async () => {
  await resetDb();
  sendEmail.mockClear();
  fetchMock.mockClear();
  integrations.whatsapp = true;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function student(opts: { phone?: string | null; whatsapp?: boolean } = {}) {
  const m = await makeMarket();
  const s = await makeStudent(m.id, "Priya Sharma");
  await db.user.update({ where: { id: s.user.id }, data: { phone: opts.phone === undefined ? "+919876543210" : opts.phone, notificationPrefs: opts.whatsapp === undefined ? {} : { whatsapp: opts.whatsapp } } });
  return s;
}

describe("whatsapp channel (D-133)", () => {
  it("normalises phone numbers to whatsapp:E.164 and rejects the rest", () => {
    expect(toWhatsAppAddress("+91 98765 43210")).toBe("whatsapp:+919876543210");
    expect(toWhatsAppAddress("whatsapp:+14155238886")).toBe("whatsapp:+14155238886");
    expect(toWhatsAppAddress("9876543210")).toBeNull();
    expect(toWhatsAppAddress("")).toBeNull();
    expect(toWhatsAppAddress(null)).toBeNull();
  });

  it("flags the expected template types", () => {
    expect(WHATSAPP_TYPES).toEqual(expect.arrayContaining(["status_interview", "status_offer", "assigned_student", "daily_digest", "renewal_reminder"]));
    expect(WHATSAPP_TYPES).not.toContain("payment_failed_admin");
  });

  it("not configured → skipped, nothing fetched", async () => {
    integrations.whatsapp = false;
    const r = await whatsappChannel.send({ to: "+919876543210", template: "status_offer", payload: { subject: "s", heading: "h", paragraphs: ["p"] }, text: "h\n\np" });
    expect(r).toEqual({ skipped: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();

    const s = await student({ whatsapp: true });
    await notify(s.user.id, "status_offer", { company: "Acme", title: "Engineer", applicationId: "a1" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opted out (or no preference) → email only", async () => {
    const s = await student({ whatsapp: false });
    await notify(s.user.id, "status_interview", { company: "Acme", title: "Engineer", when: "Mon 10:00", applicationId: "a1" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();

    const s2 = await student();
    await notify(s2.user.id, "status_interview", { company: "Acme", title: "Engineer", when: "Mon 10:00", applicationId: "a1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opted in but template not flagged → email only", async () => {
    const s = await student({ whatsapp: true });
    await notify(s.user.id, "payment_succeeded", { amount: "$49", plan: "Starter", periodEnd: "1 Nov" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opted in without a valid phone → skipped", async () => {
    const s = await student({ whatsapp: true, phone: "98765" });
    await notify(s.user.id, "status_offer", { company: "Acme", title: "Engineer", applicationId: "a1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opted in + flagged + configured → posts the plain text to Twilio with the right body", async () => {
    const s = await student({ whatsapp: true });
    await notify(s.user.id, "status_offer", { company: "Acme", title: "Engineer", applicationId: "a1" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("ACtest:secret").toString("base64")}`);
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("From")).toBe("whatsapp:+14155238886");
    expect(body.get("To")).toBe("whatsapp:+919876543210");
    const text = body.get("Body")!;
    expect(text).toContain("Offer from Acme");
    expect(text).toContain("Congratulations on the Engineer offer from Acme!");
    expect(text).toContain("/app/applications/a1");
    expect(text).not.toMatch(/<[a-z]+>/); // plain text, no HTML
  });

  it("a Twilio error never breaks the notification (email + bell still happen)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 63016, message: "outside window" }), { status: 400 }));
    const s = await student({ whatsapp: true });
    await expect(notify(s.user.id, "daily_digest", { count: 30, target: 30, companies: "Acme, Globex" })).resolves.toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(await db.notification.count({ where: { userId: s.user.id, type: "daily_digest" } })).toBe(1);
  });

  it("opt-in preference requires an E.164 phone and round-trips", async () => {
    const s = await student({ phone: null });
    await expect(setWhatsAppPref(s.user.id, true)).rejects.toThrow(/phone/i);
    await db.user.update({ where: { id: s.user.id }, data: { phone: "+447700900123" } });
    await setWhatsAppPref(s.user.id, true);
    expect(await getWhatsAppPref(s.user.id)).toMatchObject({ enabled: true, phoneValid: true, phone: "+447700900123" });
    await setWhatsAppPref(s.user.id, false);
    expect((await getWhatsAppPref(s.user.id)).enabled).toBe(false);
    // Email prefs untouched.
    const u = await db.user.findUniqueOrThrow({ where: { id: s.user.id }, select: { notificationPrefs: true } });
    expect(u.notificationPrefs).toEqual({ whatsapp: false });
  });

  it("renderPlainText joins heading, paragraphs and CTA", () => {
    expect(renderPlainText({ heading: "Hi", paragraphs: ["One", "Two"], cta: { label: "Open", href: "https://x.y/z" } })).toBe("Hi\n\nOne\nTwo\n\nOpen: https://x.y/z");
  });
});
