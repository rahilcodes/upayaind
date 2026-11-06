import { NextResponse } from "next/server";
import { providerFor, processWebhookEvent, type ProviderEvent } from "@/server/services/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Razorpay webhook (D-159). Dashboard → Settings → Webhooks → URL
 * https://<domain>/api/webhooks/razorpay, event `payment.captured`, secret =
 * RAZORPAY_WEBHOOK_SECRET. Signature is HMAC-SHA256 of the raw body in
 * `X-Razorpay-Signature`. 2xx for duplicates/ignored events; 500 so Razorpay
 * retries on processing errors.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  let event: ProviderEvent;
  try {
    event = await providerFor("RAZORPAY").verifyWebhook(raw, signature);
  } catch (e) {
    console.warn(JSON.stringify({ at: new Date().toISOString(), scope: "webhook", provider: "RAZORPAY", outcome: "rejected", reason: e instanceof Error ? e.message : "invalid" }));
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }
  try {
    const result = await processWebhookEvent("RAZORPAY", event);
    if (result.status === "in_progress") return NextResponse.json({ received: true, status: result.status }, { status: 409 });
    return NextResponse.json({ received: true, status: result.status });
  } catch {
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
