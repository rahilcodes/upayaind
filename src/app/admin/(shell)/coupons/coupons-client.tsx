"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { CloudUpload, Pencil, Plus } from "lucide-react";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, fieldA11y } from "@/components/ui/input";
import { fromMinor, minorDigits, toMinor } from "@/lib/format";
import { saveCouponAction, syncCouponAction, toggleCouponAction } from "./actions";

type PriceOption = { id: string; label: string; isActive: boolean };
type Coupon = {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffMinor: number | null;
  currency: string | null;
  maxRedemptions: number | null;
  redeemed: number;
  validFrom: string | null;
  validTo: string | null;
  planPriceIds: string[];
  providerCouponId: string | null;
  isActive: boolean;
};

const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function CouponDialog({ prices, coupon, trigger }: { prices: PriceOption[]; coupon?: Coupon; trigger?: React.ReactNode }) {
  const t = useTranslations("billing.admin.coupons");
  const tf = useTranslations("billing.admin.coupons.form");
  const tc = useTranslations("billing.admin.common");
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<"percent" | "amount">(coupon?.amountOffMinor ? "amount" : "percent");
  const [currency, setCurrency] = React.useState(coupon?.currency ?? "USD");
  const { run, pending, fieldErrors } = useServerAction(saveCouponAction, { onSuccess: () => setOpen(false) });
  const locked = Boolean(coupon && (coupon.redeemed > 0 || coupon.providerCouponId));

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amountOff") ?? 0);
    const max = String(fd.get("maxRedemptions") ?? "").trim();
    const from = String(fd.get("validFrom") ?? "");
    const to = String(fd.get("validTo") ?? "");
    run({
      id: coupon?.id,
      code: String(fd.get("code") ?? coupon?.code ?? ""),
      kind,
      percentOff: kind === "percent" ? Number(fd.get("percentOff") ?? coupon?.percentOff ?? 0) : undefined,
      amountOffMinor: kind === "amount" ? (locked ? (coupon?.amountOffMinor ?? undefined) : /^[A-Z]{3}$/.test(currency) ? toMinor(amount, currency) : undefined) : undefined,
      currency: kind === "amount" ? currency : undefined,
      maxRedemptions: max ? Number(max) : null,
      validFrom: from ? new Date(`${from}T00:00:00Z`) : null,
      validTo: to ? new Date(`${to}T23:59:59Z`) : null,
      planPriceIds: fd.getAll("planPriceIds").map(String),
      isActive: fd.get("isActive") === "on",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("newCoupon")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={coupon ? t("editCoupon") : t("newCoupon")} wide>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {locked ? (
            <p role="status" className="rounded-[10px] border border-[#C6D9FC] bg-[#EAF1FE] px-3.5 py-2.5 text-[13px] text-[#1A4FB8]">
              {tf("lockedHint")}
            </p>
          ) : null}
          <Field id="c-code" label={tf("code")} hint={tf("codeHint")} error={fieldErrors.code}>
            <Input {...fieldA11y("c-code", fieldErrors.code, true)} name="code" defaultValue={coupon?.code} disabled={locked} className="uppercase" maxLength={40} required />
          </Field>
          <fieldset disabled={locked}>
            <legend className="text-sm font-semibold">{tf("kind")}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["percent", "amount"] as const).map((k) => (
                <label key={k} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-border-strong px-3.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
                  <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="accent-[var(--primary)]" />
                  {tf(k)}
                </label>
              ))}
            </div>
          </fieldset>
          {kind === "percent" ? (
            <Field id="c-percent" label={tf("percentOff")} error={fieldErrors.percentOff}>
              <div className="relative max-w-[200px]">
                <Input {...fieldA11y("c-percent", fieldErrors.percentOff)} name="percentOff" type="number" min={1} max={100} defaultValue={coupon?.percentOff ?? 10} disabled={locked} className="pr-10 tabular" />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">%</span>
              </div>
            </Field>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <Field id="c-amount" label={tf("amountOff")} error={fieldErrors.amountOffMinor}>
                <Input
                  {...fieldA11y("c-amount", fieldErrors.amountOffMinor)}
                  name="amountOff"
                  type="number"
                  min={0}
                  step={/^[A-Z]{3}$/.test(currency) ? 1 / 10 ** minorDigits(currency) : 0.01}
                  defaultValue={coupon?.amountOffMinor && coupon.currency ? fromMinor(coupon.amountOffMinor, coupon.currency) : ""}
                  disabled={locked}
                  className="tabular"
                />
              </Field>
              <Field id="c-currency" label={tf("currency")} error={fieldErrors.currency}>
                <Input {...fieldA11y("c-currency", fieldErrors.currency)} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} disabled={locked} className="uppercase" />
              </Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="c-max" label={tf("maxRedemptions")} hint={tf("maxRedemptionsHint")} error={fieldErrors.maxRedemptions}>
              <Input {...fieldA11y("c-max", fieldErrors.maxRedemptions, true)} name="maxRedemptions" type="number" min={1} defaultValue={coupon?.maxRedemptions ?? ""} className="tabular" />
            </Field>
            <Field id="c-from" label={tf("validFrom")} error={fieldErrors.validFrom}>
              <Input {...fieldA11y("c-from", fieldErrors.validFrom)} name="validFrom" type="date" defaultValue={dateInput(coupon?.validFrom ?? null)} />
            </Field>
            <Field id="c-to" label={tf("validTo")} error={fieldErrors.validTo}>
              <Input {...fieldA11y("c-to", fieldErrors.validTo)} name="validTo" type="date" defaultValue={dateInput(coupon?.validTo ?? null)} />
            </Field>
          </div>
          {prices.length ? (
            <fieldset>
              <legend className="text-sm font-semibold">{tf("planPrices")}</legend>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{tf("planPricesHint")}</p>
              <div className="mt-2 grid max-h-48 gap-1 overflow-y-auto rounded-[10px] border border-border p-2">
                {prices.map((p) => (
                  <label key={p.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[8px] px-2 text-sm hover:bg-surface-muted">
                    <Checkbox name="planPriceIds" value={p.id} defaultChecked={coupon?.planPriceIds.includes(p.id)} />
                    <span className={p.isActive ? undefined : "text-muted-foreground"}>{p.label}</span>
                  </label>
                ))}
              </div>
              {fieldErrors.planPriceIds ? (
                <p role="alert" className="mt-1.5 text-[13px] font-medium text-danger">
                  {fieldErrors.planPriceIds[0]}
                </p>
              ) : null}
            </fieldset>
          ) : null}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox name="isActive" defaultChecked={coupon?.isActive ?? true} />
            {tf("active")}
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {tc("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CouponRowActions({ coupon, prices, stripeReady }: { coupon: Coupon; prices: PriceOption[]; stripeReady: boolean }) {
  const t = useTranslations("billing.admin.coupons");
  const toggle = useServerAction(toggleCouponAction);
  const sync = useServerAction(syncCouponAction);
  return (
    <div className="flex items-center justify-end gap-1.5">
      {!coupon.providerCouponId && stripeReady ? (
        <Button variant="outline" size="sm" loading={sync.pending} onClick={() => sync.run(coupon.id)}>
          <CloudUpload className="h-4 w-4" aria-hidden="true" />
          {t("createInStripe")}
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" loading={toggle.pending} onClick={() => toggle.run(coupon.id, !coupon.isActive)} aria-label={`${coupon.isActive ? t("deactivate") : t("activate")}: ${coupon.code}`}>
        {coupon.isActive ? t("deactivate") : t("activate")}
      </Button>
      <CouponDialog
        prices={prices}
        coupon={coupon}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`${t("editCoupon")}: ${coupon.code}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
        }
      />
    </div>
  );
}
