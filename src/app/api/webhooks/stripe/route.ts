import { NextResponse } from "next/server";
import { providerFor, processWebhookEvent, type ProviderEvent } from "@/server/services/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe webhook (SPEC F1 step 4). Verifies the signature against the raw
 * body, then hands the event to the shared, idempotent processor. Returns 2xx
 * for duplicates/ignored events and 500 on processing errors so Stripe retries.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  let event: ProviderEvent;
  try {
    event = await providerFor("STRIPE").verifyWebhook(raw, signature);
  } catch (e) {
    console.warn(JSON.stringify({ at: new Date().toISOString(), scope: "webhook", provider: "STRIPE", outcome: "rejected", reason: e instanceof Error ? e.message : "invalid" }));
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }
  try {
    const result = await processWebhookEvent("STRIPE", event);
    // Another delivery of this event is being processed right now: ask Stripe to retry later.
    if (result.status === "in_progress") return NextResponse.json({ received: true, status: result.status }, { status: 409 });
    return NextResponse.json({ received: true, status: result.status });
  } catch {
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
