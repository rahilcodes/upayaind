-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "leaveRequestId" TEXT;

-- CreateIndex
CREATE INDEX "Assignment_leaveRequestId_idx" ON "Assignment"("leaveRequestId");
