-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totpBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "pausedAt" TIMESTAMP(3);
