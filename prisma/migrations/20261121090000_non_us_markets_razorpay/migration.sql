-- D-168: only the United States pays through Stripe (US account). Every other
-- market pays through Razorpay (Indian account). One-time data change; admins
-- can still change a market's gateway afterwards in Admin → Markets.
UPDATE "Market" SET "paymentProvider" = 'RAZORPAY' WHERE "code" <> 'US' AND "paymentProvider" <> 'RAZORPAY';
