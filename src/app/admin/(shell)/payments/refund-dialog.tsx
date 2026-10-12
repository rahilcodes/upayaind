"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea, fieldA11y } from "@/components/ui/input";
import { formatMoney, fromMinor, minorDigits, toMinor } from "@/lib/format";
import { refundPaymentAction } from "./actions";

export function RefundDialog({ paymentId, invoiceNumber, currency, locale, maxMinor, provider }: { paymentId: string; invoiceNumber: string; currency: string; locale: string; maxMinor: number; provider: string }) {
  const t = useTranslations("billing.admin.payments");
  const tc = useTranslations("billing.admin.common");
  const digits = minorDigits(currency);
  const full = fromMinor(maxMinor, currency).toFixed(digits);
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState(full);
  const [reason, setReason] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(refundPaymentAction, { onSuccess: () => setOpen(false) });

  const minor = amount && !Number.isNaN(Number(amount)) ? toMinor(Number(amount), currency) : 0;
  const tooMuch = minor > maxMinor;
  const amountError = fieldErrors.amountMinor ?? (tooMuch ? t("refundAmountHint", { max: formatMoney(maxMinor, currency, locale) }) : undefined);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setAmount(full);
          setReason("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`${t("refund")}: ${invoiceNumber}`}>
          <Undo2 className="h-4 w-4" aria-hidden="true" />
          {t("refund")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("refundTitle", { number: invoiceNumber })} description={t("refundDescription", { provider })}>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!minor || tooMuch) return;
            run(paymentId, minor, reason);
          }}
        >
          <Field
            id="refund-amount"
            label={t("refundAmount")}
            hint={t("refundAmountHint", { max: formatMoney(maxMinor, currency, locale) })}
            error={amountError}
            labelAside={
              <button type="button" onClick={() => setAmount(full)} className="min-h-11 text-sm font-semibold text-primary hover:underline">
                {t("refundFull")}
              </button>
            }
          >
            <div className="relative">
              <Input {...fieldA11y("refund-amount", amountError, true)} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="pr-16 tabular" />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">{currency}</span>
            </div>
          </Field>
          <Field id="refund-reason" label={t("refundReason")} hint={t("refundReasonHint")} error={fieldErrors.reason}>
            <Textarea {...fieldA11y("refund-reason", fieldErrors.reason, true)} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="min-h-20" required />
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" variant="danger" loading={pending} disabled={!minor || tooMuch || reason.trim().length < 3}>
              {t("refundConfirm", { amount: formatMoney(minor, currency, locale) })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
