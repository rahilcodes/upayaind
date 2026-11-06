-- CreateTable (D-157): per-market plan marketing text
CREATE TABLE "PlanMarketCopy" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanMarketCopy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanMarketCopy_planId_marketId_key" ON "PlanMarketCopy"("planId", "marketId");

-- AddForeignKey
ALTER TABLE "PlanMarketCopy" ADD CONSTRAINT "PlanMarketCopy_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMarketCopy" ADD CONSTRAINT "PlanMarketCopy_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
