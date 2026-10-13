import "server-only";
import { db, Prisma } from "@/server/db";
import { audit } from "./audit";
import { deleteObject } from "./files";
import { log } from "@/server/log";

/**
 * Account purge (SPEC §10 privacy): users soft-deleted more than 30 days ago are
 * anonymised. Payments (and their invoice PDFs) are kept because they are
 * legally required records; applications and audit logs are never hard-deleted
 * (SPEC §8) but their personal content is cleared.
 */

export const PURGE_AFTER_DAYS = 30;
export const PURGED_EMAIL_DOMAIN = "deleted.invalid";
/** File purposes that must survive a purge (legal/accounting records). */
const KEEP_FILE_PURPOSES = ["invoice"];

export async function purgeDeletedUsers(now = new Date(), opts: { limit?: number } = {}) {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 86400e3);
  const users = await db.user.findMany({
    where: { deletedAt: { lte: cutoff }, NOT: { email: { endsWith: `@${PURGED_EMAIL_DOMAIN}` } } },
    select: { id: true, role: true, student: { select: { id: true } } },
    take: opts.limit ?? 200,
  });
  let purged = 0;
  for (const u of users) {
    try {
      await purgeUser(u.id, u.student?.id ?? null);
      purged++;
    } catch (e) {
      log.error("privacy.purge_failed", { userId: u.id, err: e });
    }
  }
  return { purged, candidates: users.length };
}

async function purgeUser(userId: string, studentId: string | null) {
  const files = await db.fileObject.findMany({
    where: { OR: [{ ownerUserId: userId }, ...(studentId ? [{ studentId }] : [])], purpose: { notIn: KEEP_FILE_PURPOSES } },
    select: { id: true, key: true },
  });

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted+${userId}@${PURGED_EMAIL_DOMAIN}`,
        name: "Deleted user",
        phone: null,
        avatarKey: null,
        passwordHash: null,
        totpSecretEnc: null,
        totpEnabled: false,
        notificationPrefs: Prisma.DbNull,
        status: "DEACTIVATED",
      },
    });
    await tx.account.deleteMany({ where: { userId } });
    await tx.authToken.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.loginEvent.updateMany({ where: { userId }, data: { ip: null, userAgent: null, email: null } });
    await tx.message.updateMany({ where: { senderId: userId }, data: { body: "[deleted]", attachmentKeys: [] } });

    if (studentId) {
      await tx.studentProfile.update({
        where: { id: studentId },
        data: {
          linkedinUrl: null,
          githubUrl: null,
          portfolioUrl: null,
          workAuthorization: null,
          targetTitles: [],
          industries: [],
          locations: [],
          minSalaryMinor: null,
          avoidCompanies: [],
          targetCompanies: [],
          masterProfile: Prisma.DbNull,
          internalNotes: null,
          noticePeriod: null,
          seniority: null,
        },
      });
      // Vault secrets are wiped; the rows stay so the access log keeps its references.
      await tx.credential.updateMany({ where: { studentId }, data: { usernameEnc: "", passwordEnc: "", notesEnc: null, label: "Deleted", loginUrl: null, deletedAt: new Date() } });
      await tx.resumeVersion.updateMany({ where: { studentId }, data: { content: {}, pdfKey: null, docxKey: null, originalFileKey: null, jdAnalysis: Prisma.DbNull, coverLetter: null, validation: Prisma.DbNull } });
      await tx.jobApplication.updateMany({ where: { studentId }, data: { jdText: null, coverLetter: null, proofKey: null, proofText: null, notes: null } });
      await tx.message.updateMany({ where: { thread: { studentId } }, data: { body: "[deleted]", attachmentKeys: [] } });
      await tx.mockInterview.updateMany({ where: { studentId }, data: { feedback: null } });
    }
    await tx.fileObject.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
    await audit({ actorId: null, action: "privacy.purge", entity: "User", entityId: userId, after: { studentId, filesDeleted: files.length } }, tx);
  });

  // Storage objects are removed after the DB commit (best effort).
  await Promise.allSettled(files.map((f) => deleteObject(f.key)));
}
