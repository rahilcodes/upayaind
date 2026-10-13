import "server-only";
import { db } from "@/server/db";
import { isStaff } from "@/server/auth/rbac";
import { absoluteUrl, firstName } from "@/lib/utils";
import { consumeToken, issueToken, peekToken } from "./auth-tokens";
import { sendEmail } from "./email";
import { trackEvent } from "./events";

/**
 * Passwordless login for students (D-111): a 15-minute single-use `MAGIC_LINK`
 * AuthToken emailed to the address. Staff accounts never get one (password +
 * TOTP only, SPEC §10). The request never reveals whether an account exists.
 */

export class MagicLinkError extends Error {
  constructor(public code: "invalid" | "staff" | "inactive") {
    super(code);
    this.name = "MagicLinkError";
  }
}

const USER_SELECT = { id: true, name: true, email: true, role: true, status: true, deletedAt: true } as const;

/** Always resolves (no account enumeration). Returns whether an email was actually sent, for tests only. */
export async function requestMagicLink(email: string, next?: string | null): Promise<boolean> {
  const user = await db.user.findUnique({ where: { email }, select: USER_SELECT });
  if (!user || user.deletedAt || isStaff(user.role) || user.status === "SUSPENDED" || user.status === "DEACTIVATED") return false;
  const token = await issueToken(user.id, "MAGIC_LINK");
  const params = new URLSearchParams({ token });
  if (next && next.startsWith("/") && !next.startsWith("//")) params.set("next", next);
  await sendEmail({
    to: user.email,
    subject: "Your UpayaInd login link",
    content: {
      preview: "Tap the button to log in — the link works once and expires in 15 minutes",
      heading: `Hi ${firstName(user.name)}, here’s your login link`,
      paragraphs: ["Use the button below to log in to UpayaInd without a password.", "The link works once and expires in 15 minutes."],
      cta: { label: "Log in to UpayaInd", href: absoluteUrl(`/login/magic?${params.toString()}`) },
      footnote: "If you didn’t request this, you can ignore this email. Nobody can log in without this link.",
    },
  });
  await trackEvent("magic_link_requested", user.id, {});
  return true;
}

/** True when the link can still be used (shown as a "Continue" button so email scanners can't burn it). */
export async function magicLinkIsValid(raw: string) {
  return peekToken(raw, "MAGIC_LINK");
}

/** Consume the token and return the user to sign in. Throws MagicLinkError. */
export async function consumeMagicLink(raw: string) {
  const userId = await consumeToken(raw, "MAGIC_LINK");
  if (!userId) throw new MagicLinkError("invalid");
  const user = await db.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  if (!user) throw new MagicLinkError("invalid");
  if (isStaff(user.role)) throw new MagicLinkError("staff");
  if (user.deletedAt || user.status === "SUSPENDED" || user.status === "DEACTIVATED") throw new MagicLinkError("inactive");
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), emailVerified: new Date(), status: user.status === "INVITED" ? "ACTIVE" : undefined },
  });
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
