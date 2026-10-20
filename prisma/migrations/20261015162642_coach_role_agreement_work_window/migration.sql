-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'COACH';

-- DropIndex
DROP INDEX "JobApplication_company_trgm";

-- DropIndex
DROP INDEX "JobApplication_title_trgm";

-- AlterTable
ALTER TABLE "MockInterview" ADD COLUMN     "coachId" TEXT,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "coachId" TEXT,
ADD COLUMN     "consentAgreementAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MockInterview_coachId_scheduledAt_idx" ON "MockInterview"("coachId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockInterview" ADD CONSTRAINT "MockInterview_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
