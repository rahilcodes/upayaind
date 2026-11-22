-- D-171: free trial per market, service start date and trial end per subscription.
ALTER TABLE "Market" ADD COLUMN "trialDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "serviceStartAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
-- United States: 7-day free trial for first-time students (client request, 22 Nov 2026).
UPDATE "Market" SET "trialDays" = 7 WHERE "code" = 'US';
