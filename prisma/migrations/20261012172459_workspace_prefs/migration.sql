-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN     "workspacePrefs" JSONB;

-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "reminder1hSentAt" TIMESTAMP(3),
ADD COLUMN     "reminder24SentAt" TIMESTAMP(3);
