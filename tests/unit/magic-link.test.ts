import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { consumeMagicLink, magicLinkIsValid, MagicLinkError, requestMagicLink } from "@/server/services/magic-link";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";

const sendEmail = vi.fn(async () => ({ id: "dev" }));
vi.mock("@/server/services/email", () => ({ sendEmail: (...a: unknown[]) => (sendEmail as (...x: unknown[]) => Promise<{ id: string }>)(...a) }));

function tokenFromEmail(): string {
  const call = sendEmail.mock.calls.at(-1) as unknown as [{ content: { cta: { href: string } } }];
  const href = call[0].content.cta.href;
  return new URL(href).searchParams.get("token")!;
}

describe("magic-link login (D-111)", () => {
  beforeEach(async () => {
    await resetDb();
    sendEmail.mockClear();
  });

  it("emails a 15-minute single-use token to a student and consumes it once", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id, "Priya Sharma");
    expect(await requestMagicLink(s.user.email)).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const token = tokenFromEmail();
    const row = await db.authToken.findFirstOrThrow({ where: { userId: s.user.id, type: "MAGIC_LINK" } });
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(15 * 60e3 + 1000);
    expect(await magicLinkIsValid(token)).toBe(true);

    const user = await consumeMagicLink(token);
    expect(user.id).toBe(s.user.id);
    expect(user.role).toBe("STUDENT");
    expect((await db.user.findUniqueOrThrow({ where: { id: s.user.id } })).lastLoginAt).not.toBeNull();

    // Single use.
    expect(await magicLinkIsValid(token)).toBe(false);
    await expect(consumeMagicLink(token)).rejects.toMatchObject({ code: "invalid" } satisfies Partial<MagicLinkError>);
  });

  it("rejects expired tokens", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    await requestMagicLink(s.user.email);
    const token = tokenFromEmail();
    await db.authToken.updateMany({ where: { userId: s.user.id, type: "MAGIC_LINK" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await magicLinkIsValid(token)).toBe(false);
    await expect(consumeMagicLink(token)).rejects.toMatchObject({ code: "invalid" });
  });

  it("never issues a link to staff or unknown emails (no enumeration), and refuses staff tokens if one existed", async () => {
    const m = await makeMarket();
    const e = await makeEmployee(m.id);
    expect(await requestMagicLink(e.user.email)).toBe(false);
    expect(await requestMagicLink("nobody@example.com")).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();

    // Defence in depth: even a token forged into the DB for a staff account is refused at consumption.
    const { issueToken } = await import("@/server/services/auth-tokens");
    const raw = await issueToken(e.user.id, "MAGIC_LINK");
    await expect(consumeMagicLink(raw)).rejects.toMatchObject({ code: "staff" });
  });

  it("refuses suspended accounts", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    await requestMagicLink(s.user.email);
    const token = tokenFromEmail();
    await db.user.update({ where: { id: s.user.id }, data: { status: "SUSPENDED" } });
    await expect(consumeMagicLink(token)).rejects.toMatchObject({ code: "inactive" });
  });
});
