/**
 * Email existing students their "account is ready" onboarding message.
 *
 *   pnpm tsx --conditions=react-server scripts/send-login-details.ts emails.json
 *
 * emails.json: ["a@x.com", "b@y.com"]  — each must already be a student account.
 * The password is never emailed (the team shares it directly); the email says
 * where to log in and what happens next. Uses the app's normal email transport
 * (Resend / SMTP from .env), so it fails loudly if email is not configured.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "../src/server/db";
import { sendEmail } from "../src/server/services/email";
import { emailTransport } from "../src/env";
import { absoluteUrl } from "../src/lib/utils";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: send-login-details.ts <emails.json>");
  if (emailTransport === "console") throw new Error("Email is not configured (RESEND_API_KEY or SMTP_*): nothing would be delivered.");
  const emails = JSON.parse(readFileSync(file, "utf8")) as string[];
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    const user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, role: "STUDENT", deletedAt: null }, select: { id: true, email: true, name: true } });
    if (!user) {
      console.log(`• ${email}: no student account — skipped`);
      continue;
    }
    try {
      const r = await sendEmail({
        to: user.email,
        subject: "Your UpayaInd account is ready",
        content: {
          preview: "Log in with the email and password your UpayaInd team gave you.",
          heading: `Welcome, ${user.name.split(/\s+/)[0]}!`,
          paragraphs: [
            `Your UpayaInd account for ${user.email} is ready. Log in with the password the team shared with you, then complete your profile: upload your resume, set your target roles, cities, CTC and notice period, and add the job-portal logins you want us to use.`,
            "Once your profile is complete, your specialist starts applying for you and you can track every application live from your dashboard.",
            "You can change your password any time from Settings, or use “Forgot password?” on the login page.",
          ],
          cta: { label: "Log in to UpayaInd", href: absoluteUrl("/login") },
          footnote: "Questions? Reply to this email or message us on WhatsApp at +91 95508 88128.",
        },
        replyTo: "contact@upayaind.com",
      });
      await db.auditLog.create({ data: { actorId: null, action: "student.login_details_sent", entity: "User", entityId: user.id, after: { transport: emailTransport, messageId: r.id, source: "scripts/send-login-details.ts" } } });
      console.log(`✓ ${user.email}: sent (${r.id})`);
    } catch (e) {
      console.log(`✗ ${user.email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
