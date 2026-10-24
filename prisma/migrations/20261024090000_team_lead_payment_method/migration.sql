-- AlterEnum (D-149): team lead role
ALTER TYPE "Role" ADD VALUE 'TEAM_LEAD';

-- AlterTable (D-147b): how an offline payment was made
ALTER TABLE "Payment" ADD COLUMN     "method" TEXT,
ADD COLUMN     "reference" TEXT;
