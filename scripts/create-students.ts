/**
 * Create student accounts in bulk (existing applicants who signed up offline).
 *
 *   pnpm tsx --conditions=react-server scripts/create-students.ts applicants.json [--out logins.csv]
 *
 * applicants.json: [{ "name": "Gowtham", "phone": "9381485835", "email": "x@y.com", "role": "AIML Fresher", "market": "IN" }]
 *
 * Each student gets: role STUDENT, status ACTIVE, email verified (they were
 * vetted in person), market + timezone, target title from `role`, and a strong
 * random password which is printed/written ONCE — it is never stored in clear.
 * Consents stay null: the student accepts the terms during onboarding.
 * Existing emails are skipped (reported), never overwritten.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { db } from "../src/server/db";

type Applicant = { name: string; phone?: string; email: string; role?: string; market?: string };

const WORDS = ["Summit", "Harbor", "Falcon", "Maple", "Orbit", "Delta", "Lotus", "Nimbus", "Ember", "Quartz", "Zenith", "Cobalt", "Aurora", "Granite", "Juniper", "Meteor", "Saffron", "Tundra", "Velvet", "Willow"];
function password() {
  const w1 = WORDS[randomInt(WORDS.length)]!;
  const w2 = WORDS[randomInt(WORDS.length)]!;
  return `${w1}-${w2}-${randomInt(1000, 9999)}!`;
}

function e164(raw: string | undefined, dial: string) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return `+${dial}${digits}`;
}

async function main() {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) throw new Error("Usage: create-students.ts <applicants.json> [--out logins.csv]");
  const outIdx = rest.indexOf("--out");
  const out = outIdx >= 0 ? rest[outIdx + 1] : null;
  const applicants = JSON.parse(readFileSync(file, "utf8")) as Applicant[];
  const rows: string[] = ["name,email,password,status"];

  for (const a of applicants) {
    const email = a.email.trim().toLowerCase();
    const code = (a.market ?? "IN").toUpperCase();
    const market = await db.market.findUnique({ where: { code }, select: { id: true, defaultTimezone: true } });
    if (!market) throw new Error(`Market ${code} not found`);
    const existing = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
    if (existing) {
      rows.push(`${a.name},${email},,already exists (skipped)`);
      console.log(`• ${email}: already exists — skipped`);
      continue;
    }
    const pw = password();
    const passwordHash = await hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 });
    const phone = e164(a.phone, code === "IN" ? "91" : code === "UK" ? "44" : "1");
    const now = new Date();
    await db.user.create({
      data: {
        email,
        name: a.name.trim(),
        phone,
        passwordHash,
        role: "STUDENT",
        status: "ACTIVE",
        timezone: market.defaultTimezone,
        emailVerified: now,
        student: { create: { marketId: market.id, targetTitles: a.role ? [a.role.trim()] : [], internalNotes: `Existing applicant; account created by script on ${now.toISOString().slice(0, 10)}.` } },
      },
    });
    await db.auditLog.create({ data: { actorId: null, action: "student.create", entity: "User", entityId: email, after: { source: "scripts/create-students.ts", market: code } } }).catch(() => undefined);
    rows.push(`${a.name},${email},${pw},created`);
    console.log(`✓ ${email}: created`);
  }

  const csv = rows.join("\n") + "\n";
  if (out) {
    writeFileSync(out, csv, { mode: 0o600 });
    console.log(`\nLogins written to ${out} (share securely, then delete the file).`);
  } else {
    console.log("\n" + csv);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
