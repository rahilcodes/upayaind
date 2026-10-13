-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'CREDITED');

-- AlterEnum
ALTER TYPE "AuthTokenType" ADD VALUE 'MAGIC_LINK';

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "lastDigestKey" TEXT,
ADD COLUMN     "lastWeeklyReportKey" TEXT,
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT;

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "creditMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creditedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredId_key" ON "Referral"("referredId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_status_idx" ON "Referral"("referrerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_referralCode_key" ON "StudentProfile"("referralCode");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
