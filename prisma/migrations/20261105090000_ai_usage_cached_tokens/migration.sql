-- AlterTable (D-156): prompt-cache reads per AI call
ALTER TABLE "AiUsage" ADD COLUMN     "cachedTokens" INTEGER NOT NULL DEFAULT 0;
