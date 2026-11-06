"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmRazorpayPaymentAction } from "../actions";

/**
 * Razorpay Checkout.js (D-159). Loads the script, opens the payment modal
 * for the pre-created order and, on success, sends the signed result to the
 * server, which verifies it and activates the plan (idempotent with the webhook).
 */

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (r: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
};
declare global {
  interface Window {
    Razorpay?: new (o: RazorpayOptions) => { open: () => void; on: (ev: string, cb: (r: { error?: { description?: string } }) => void) => void };
  }
}

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

export function RazorpayPay({ keyId, orderId, amountMinor, currency, amountLabel, description, prefill }: { keyId: string; orderId: string; amountMinor: number; currency: string; amountLabel: string; description: string; prefill: { name: string; email: string; contact: string } }) {
  const t = useTranslations("billing.checkout.razorpay");
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "open" | "verifying" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (window.Razorpay) {
      setReady(true);
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => setReady(true);
    s.onerror = () => setError(t("scriptFailed"));
    document.body.appendChild(s);
    return () => {
      s.remove();
    };
  }, [t]);

  const open = React.useCallback(() => {
    if (!window.Razorpay) return;
    setError(null);
    setState("open");
    const rz = new window.Razorpay({
      key: keyId,
      amount: amountMinor,
      currency,
      order_id: orderId,
      name: "UpayaInd",
      description,
      prefill,
      theme: { color: "#2563DE" },
      handler: async (r) => {
        setState("verifying");
        const res = await confirmRazorpayPaymentAction({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
        if (!res.ok) {
          setError(res.error);
          setState("idle");
          return;
        }
        setState("done");
        router.push("/app/onboarding?paid=1");
      },
      modal: { ondismiss: () => setState((s) => (s === "open" ? "idle" : s)) },
    });
    rz.on("payment.failed", (r) => {
      setError(r.error?.description ?? t("failed"));
      setState("idle");
    });
    rz.open();
  }, [keyId, amountMinor, currency, orderId, description, prefill, router, t]);

  // Open the modal as soon as the script is ready (the student already clicked "Continue to payment").
  const autoOpened = React.useRef(false);
  React.useEffect(() => {
    if (ready && !autoOpened.current) {
      autoOpened.current = true;
      open();
    }
  }, [ready, open]);

  return (
    <div className="mt-6">
      {state === "verifying" || state === "done" ? (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {state === "done" ? t("success") : t("verifying")}
        </p>
      ) : (
        <Button size="lg" className="w-full" onClick={open} disabled={!ready || state === "open"} loading={!ready}>
          {ready ? t("pay", { amount: amountLabel }) : t("loading")}
        </Button>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
