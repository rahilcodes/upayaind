"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, CreditCard, MoreHorizontal, PlusCircle, Repeat, ShieldCheck, XCircle } from "lucide-react";
import type { BillingInterval, SubscriptionStatus } from "@/generated/prisma/enums";
import { SubscriptionStatusPill } from "@/components/billing/status-pills";
import { useServerAction } from "@/components/portal/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { periodEndFor } from "@/lib/billing-period";
import { formatDate, formatMoney, fromMinor, minorDigits, toMinor } from "@/lib/format";
import { cancelAtPeriodEndAction, changePlanAction, grantPlanAction, listGrantablePricesAction, recordManualPaymentAction, setSubscriptionPeriodAction, setSubscriptionStatusAction } from "../billing-actions";

/**
 * Admin toolbar for the Student 360 billing tab (D-147b): grant a manual plan,
 * record an offline payment, and per-subscription actions for MANUAL rows.
 * Gateway rows (Stripe/Razorpay) are read-only here; pause/resume lives in
 * `PauseControls` and is not duplicated.
 */

export type BillingSubscription = {
  id: string;
  status: SubscriptionStatus;
  provider: string;
  planPriceId?: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  planPrice: { interval: BillingInterval; amountMinor: number; currency: string; dailyTarget: number; plan: { name: string } };
};

export type GrantablePrice = { id: string; planName: string; interval: BillingInterval; amountMinor: number; currency: string; dailyTarget: number; placeholder: boolean };

type Props = { studentId: string; marketId: string; currency: string; locale: string; tz: string; subscriptions: BillingSubscription[] };

type RowDialog = { kind: "change" | "period" | "status" | "cancel"; sub: BillingSubscription } | null;

const DAY_INPUT = (d: Date) => d.toISOString().slice(0, 10);
/** Noon UTC so the picked calendar day reads the same in every admin timezone. */
const fromDayInput = (v: string) => new Date(`${v}T12:00:00.000Z`);
const todayInput = () => DAY_INPUT(new Date());

export function BillingControls({ studentId, marketId, currency, locale, tz, subscriptions }: Props) {
  const t = useTranslations("admin.student360.billingAdmin");
  const [grantOpen, setGrantOpen] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const [row, setRow] = React.useState<RowDialog>(null);
  const prices = usePrices(marketId, grantOpen || row?.kind === "change");

  return (
    <div className="grid gap-4 rounded-[var(--radius-lg)] border border-border bg-surface-muted/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold">{t("title")}</p>
          <p className="text-[13px] text-muted-foreground">{t("hint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setGrantOpen(true)}>
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            {t("grant")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            {t("recordPayment")}
          </Button>
        </div>
      </div>

      {subscriptions.length ? (
        <ul className="grid gap-2" aria-label={t("manageList")}>
          {subscriptions.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.planPrice.plan.name}</p>
                <p className="tabular text-[12px] text-muted-foreground">
                  {s.currentPeriodStart ? formatDate(s.currentPeriodStart, tz) : "—"} – {s.currentPeriodEnd ? formatDate(s.currentPeriodEnd, tz) : "—"}
                  {s.cancelAtPeriodEnd ? ` · ${t("endsAtPeriodEnd")}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SubscriptionStatusPill status={s.status} />
                <ProviderBadge provider={s.provider} />
                {s.provider === "MANUAL" ? (
                  <Dropdown>
                    <DropdownTrigger asChild>
                      <Button variant="outline" size="icon-sm" aria-label={t("rowMenu", { plan: s.planPrice.plan.name })}>
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownContent>
                      <DropdownLabel>{t("rowMenuLabel")}</DropdownLabel>
                      <DropdownItem onSelect={() => setRow({ kind: "change", sub: s })} disabled={s.status === "CANCELED" || s.status === "EXPIRED"}>
                        <Repeat className="h-4 w-4" aria-hidden="true" />
                        {t("changePlan")}
                      </DropdownItem>
                      <DropdownItem onSelect={() => setRow({ kind: "period", sub: s })}>
                        <CalendarClock className="h-4 w-4" aria-hidden="true" />
                        {t("editPeriod")}
                      </DropdownItem>
                      <DropdownItem onSelect={() => setRow({ kind: "status", sub: s })}>
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        {t("setStatus")}
                      </DropdownItem>
                      {s.status === "ACTIVE" || s.status === "PAUSED" ? (
                        <>
                          <DropdownSeparator />
                          <DropdownItem onSelect={() => setRow({ kind: "cancel", sub: s })}>
                            <XCircle className="h-4 w-4" aria-hidden="true" />
                            {s.cancelAtPeriodEnd ? t("keep") : t("cancelAtEnd")}
                          </DropdownItem>
                        </>
                      ) : null}
                    </DropdownContent>
                  </Dropdown>
                ) : (
                  <span className="text-[12px] text-muted-foreground">{t("managedBy", { provider: providerLabel(s.provider) })}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <GrantPlanDialog open={grantOpen} onOpenChange={setGrantOpen} studentId={studentId} prices={prices} locale={locale} />
      <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} studentId={studentId} currency={currency} locale={locale} subscriptions={subscriptions} />
      {row?.kind === "change" ? <ChangePlanDialog sub={row.sub} prices={prices} locale={locale} onClose={() => setRow(null)} /> : null}
      {row?.kind === "period" ? <EditPeriodDialog sub={row.sub} onClose={() => setRow(null)} /> : null}
      {row?.kind === "status" ? <SetStatusDialog sub={row.sub} onClose={() => setRow(null)} /> : null}
      {row?.kind === "cancel" ? <CancelAtEndDialog sub={row.sub} tz={tz} onClose={() => setRow(null)} /> : null}
    </div>
  );
}

// ───────────────────────────── bits ─────────────────────────────

function providerLabel(p: string) {
  return p === "STRIPE" ? "Stripe" : p === "RAZORPAY" ? "Razorpay" : p;
}

function ProviderBadge({ provider }: { provider: string }) {
  const t = useTranslations("admin.student360.billingAdmin");
  if (provider === "MANUAL") return <Badge tone="violet">{t("manual")}</Badge>;
  return <Badge tone="blue">{providerLabel(provider)}</Badge>;
}

function usePrices(marketId: string, wanted: boolean) {
  const [prices, setPrices] = React.useState<GrantablePrice[] | null>(null);
  React.useEffect(() => {
    if (!wanted || prices) return;
    let alive = true;
    listGrantablePricesAction(marketId).then((r) => {
      if (alive && r.ok) setPrices(r.data as GrantablePrice[]);
    });
    return () => {
      alive = false;
    };
  }, [wanted, prices, marketId]);
  return prices;
}

function PriceSelect({ id, value, onChange, prices, locale, error, excludeId }: { id: string; value: string; onChange: (v: string) => void; prices: GrantablePrice[] | null; locale: string; error?: string[]; excludeId?: string }) {
  const t = useTranslations("admin.student360.billingAdmin");
  const ti = useTranslations("interval");
  return (
    <Field id={id} label={t("price")} error={error} hint={prices && prices.length === 0 ? t("noPrices") : undefined}>
      <Select {...fieldA11y(id, error)} value={value} onChange={(e) => onChange(e.target.value)} required disabled={!prices}>
        <option value="">{prices ? t("pickPrice") : t("loading")}</option>
        {(prices ?? [])
          .filter((p) => p.id !== excludeId)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.planName} · {ti(p.interval)} · {p.placeholder ? t("placeholderPrice") : formatMoney(p.amountMinor, p.currency, locale)} · {t("perDay", { n: p.dailyTarget })}
            </option>
          ))}
      </Select>
    </Field>
  );
}

function DialogButtons({ pending, label, onCancel, variant = "primary", disabled }: { pending: boolean; label: string; onCancel: () => void; variant?: "primary" | "danger"; disabled?: boolean }) {
  const tc = useTranslations("common");
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        {tc("cancel")}
      </Button>
      <Button type="submit" variant={variant} loading={pending} disabled={disabled}>
        {label}
      </Button>
    </div>
  );
}

// ───────────────────────────── grant plan ─────────────────────────────

function GrantPlanDialog({ open, onOpenChange, studentId, prices, locale }: { open: boolean; onOpenChange: (v: boolean) => void; studentId: string; prices: GrantablePrice[] | null; locale: string }) {
  const t = useTranslations("admin.student360.billingAdmin");
  const id = React.useId().replace(/:/g, "");
  const [priceId, setPriceId] = React.useState("");
  const [start, setStart] = React.useState(todayInput);
  const [end, setEnd] = React.useState("");
  const [endEdited, setEndEdited] = React.useState(false);
  const [status, setStatus] = React.useState<"ACTIVE" | "PENDING_PAYMENT">("ACTIVE");
  const [note, setNote] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(grantPlanAction, { onSuccess: () => onOpenChange(false) });
  const price = prices?.find((p) => p.id === priceId);

  // Period end follows start + interval until the admin edits it.
  React.useEffect(() => {
    if (endEdited || !price || !start) return;
    setEnd(DAY_INPUT(periodEndFor(fromDayInput(start), price.interval)));
  }, [price, start, endEdited]);

  const reset = () => {
    setPriceId("");
    setStart(todayInput());
    setEnd("");
    setEndEdited(false);
    setStatus("ACTIVE");
    setNote("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) reset();
      }}
    >
      <DialogContent title={t("grantTitle")} description={t("grantBody")}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!priceId) return;
            run({ studentId, planPriceId: priceId, startsAt: fromDayInput(start), periodEnd: end ? fromDayInput(end) : undefined, status, note: note || undefined });
          }}
        >
          <PriceSelect id={`g-price-${id}`} value={priceId} onChange={setPriceId} prices={prices} locale={locale} error={fieldErrors.planPriceId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`g-start-${id}`} label={t("startsOn")} error={fieldErrors.startsAt}>
              <Input {...fieldA11y(`g-start-${id}`, fieldErrors.startsAt)} type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
            </Field>
            <Field id={`g-end-${id}`} label={t("periodEnd")} hint={endEdited ? undefined : t("periodEndAuto")} error={fieldErrors.periodEnd}>
              <Input
                {...fieldA11y(`g-end-${id}`, fieldErrors.periodEnd, !endEdited)}
                type="date"
                value={end}
                min={start}
                onChange={(e) => {
                  setEndEdited(true);
                  setEnd(e.target.value);
                }}
                required
              />
            </Field>
          </div>
          <Field id={`g-status-${id}`} label={t("status")} hint={status === "ACTIVE" ? t("statusActiveHint") : t("statusPendingHint")}>
            <Select {...fieldA11y(`g-status-${id}`, undefined, true)} value={status} onChange={(e) => setStatus(e.target.value as "ACTIVE" | "PENDING_PAYMENT")}>
              <option value="ACTIVE">{t("statusActive")}</option>
              <option value="PENDING_PAYMENT">{t("statusPending")}</option>
            </Select>
          </Field>
          <Field id={`g-note-${id}`} label={t("note")} hint={t("noteHint")} error={fieldErrors.note}>
            <Textarea {...fieldA11y(`g-note-${id}`, fieldErrors.note, true)} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-20" />
          </Field>
          <DialogButtons pending={pending} label={t("grant")} onCancel={() => onOpenChange(false)} disabled={!priceId || !end} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── record payment ─────────────────────────────

function RecordPaymentDialog({ open, onOpenChange, studentId, currency, locale, subscriptions }: { open: boolean; onOpenChange: (v: boolean) => void; studentId: string; currency: string; locale: string; subscriptions: BillingSubscription[] }) {
  const t = useTranslations("admin.student360.billingAdmin");
  const ti = useTranslations("interval");
  const id = React.useId().replace(/:/g, "");
  const linkable = subscriptions.filter((s) => s.status !== "CANCELED" && s.status !== "EXPIRED");
  const defaultSub = linkable.find((s) => s.status === "ACTIVE" || s.status === "PAUSED" || s.status === "PAST_DUE") ?? linkable.find((s) => s.status === "PENDING_PAYMENT") ?? null;
  const [subId, setSubId] = React.useState(defaultSub?.id ?? "");
  const [amount, setAmount] = React.useState("");
  const [paidOn, setPaidOn] = React.useState(todayInput);
  const [method, setMethod] = React.useState("bank");
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(recordManualPaymentAction, { onSuccess: () => onOpenChange(false) });
  const linked = linkable.find((s) => s.id === subId);
  const cur = linked?.planPrice.currency ?? currency;
  const digits = minorDigits(cur);
  const step = digits ? `0.${"0".repeat(digits - 1)}1` : "1";

  const reset = () => {
    setSubId(defaultSub?.id ?? "");
    setAmount(defaultSub ? String(fromMinor(defaultSub.planPrice.amountMinor, defaultSub.planPrice.currency)) : "");
    setPaidOn(todayInput());
    setMethod("bank");
    setReference("");
    setNote("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) reset();
      }}
    >
      <DialogContent title={t("paymentTitle")} description={t("paymentBody")}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(amount);
            if (!Number.isFinite(n) || n <= 0) return;
            run({ studentId, subscriptionId: subId || null, amountMinor: toMinor(n, cur), currency: cur, paidAt: fromDayInput(paidOn), method: method as "bank", reference: reference || undefined, note: note || undefined });
          }}
        >
          <Field id={`p-sub-${id}`} label={t("linkSubscription")} hint={t("linkSubscriptionHint")} error={fieldErrors.subscriptionId}>
            <Select
              {...fieldA11y(`p-sub-${id}`, fieldErrors.subscriptionId, true)}
              value={subId}
              onChange={(e) => {
                setSubId(e.target.value);
                const s = linkable.find((x) => x.id === e.target.value);
                if (s && !amount) setAmount(String(fromMinor(s.planPrice.amountMinor, s.planPrice.currency)));
              }}
            >
              <option value="">{t("noSubscription")}</option>
              {linkable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.planPrice.plan.name} · {ti(s.planPrice.interval)} · {t(`status_${s.status}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`p-amount-${id}`} label={t("amount", { currency: cur })} error={fieldErrors.amountMinor ?? fieldErrors.currency}>
              <Input {...fieldA11y(`p-amount-${id}`, fieldErrors.amountMinor ?? fieldErrors.currency)} type="number" inputMode="decimal" min={step} step={step} value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
            <Field id={`p-date-${id}`} label={t("paidOn")} error={fieldErrors.paidAt}>
              <Input {...fieldA11y(`p-date-${id}`, fieldErrors.paidAt)} type="date" value={paidOn} max={todayInput()} onChange={(e) => setPaidOn(e.target.value)} required />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`p-method-${id}`} label={t("method")}>
              <Select {...fieldA11y(`p-method-${id}`)} value={method} onChange={(e) => setMethod(e.target.value)}>
                {(["bank", "cash", "upi", "card", "other"] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`method_${m}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={`p-ref-${id}`} label={t("reference")} hint={t("referenceHint")} error={fieldErrors.reference}>
              <Input {...fieldA11y(`p-ref-${id}`, fieldErrors.reference, true)} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
            </Field>
          </div>
          <Field id={`p-note-${id}`} label={t("note")} hint={t("noteHint")} error={fieldErrors.note}>
            <Textarea {...fieldA11y(`p-note-${id}`, fieldErrors.note, true)} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-20" />
          </Field>
          {linked?.status === "PENDING_PAYMENT" ? <p className="text-[13px] text-muted-foreground">{t("willActivate")}</p> : null}
          {amount && Number(amount) > 0 ? <p className="text-sm font-semibold">{t("paymentSummary", { amount: formatMoney(toMinor(Number(amount), cur), cur, locale) })}</p> : null}
          <DialogButtons pending={pending} label={t("recordPayment")} onCancel={() => onOpenChange(false)} disabled={!amount} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── row dialogs ─────────────────────────────

function ChangePlanDialog({ sub, prices, locale, onClose }: { sub: BillingSubscription; prices: GrantablePrice[] | null; locale: string; onClose: () => void }) {
  const t = useTranslations("admin.student360.billingAdmin");
  const id = React.useId().replace(/:/g, "");
  const [priceId, setPriceId] = React.useState("");
  const [note, setNote] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(changePlanAction, { onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={t("changeTitle")} description={t("changeBody", { plan: sub.planPrice.plan.name })}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (priceId) run({ subscriptionId: sub.id, planPriceId: priceId, note: note || undefined });
          }}
        >
          <PriceSelect id={`c-price-${id}`} value={priceId} onChange={setPriceId} prices={prices} locale={locale} error={fieldErrors.planPriceId} excludeId={sub.planPriceId} />
          <Field id={`c-note-${id}`} label={t("note")} hint={t("noteHint")} error={fieldErrors.note}>
            <Textarea {...fieldA11y(`c-note-${id}`, fieldErrors.note, true)} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-20" />
          </Field>
          <DialogButtons pending={pending} label={t("changePlan")} onCancel={onClose} disabled={!priceId} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditPeriodDialog({ sub, onClose }: { sub: BillingSubscription; onClose: () => void }) {
  const t = useTranslations("admin.student360.billingAdmin");
  const id = React.useId().replace(/:/g, "");
  const [start, setStart] = React.useState(sub.currentPeriodStart ? DAY_INPUT(sub.currentPeriodStart) : todayInput());
  const [end, setEnd] = React.useState(sub.currentPeriodEnd ? DAY_INPUT(sub.currentPeriodEnd) : "");
  const { run, pending, fieldErrors } = useServerAction(setSubscriptionPeriodAction, { onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={t("periodTitle")} description={t("periodBody")}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run({ subscriptionId: sub.id, currentPeriodStart: fromDayInput(start), currentPeriodEnd: fromDayInput(end) });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`e-start-${id}`} label={t("startsOn")} error={fieldErrors.currentPeriodStart}>
              <Input {...fieldA11y(`e-start-${id}`, fieldErrors.currentPeriodStart)} type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
            </Field>
            <Field id={`e-end-${id}`} label={t("periodEnd")} error={fieldErrors.currentPeriodEnd}>
              <Input {...fieldA11y(`e-end-${id}`, fieldErrors.currentPeriodEnd)} type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
            </Field>
          </div>
          <DialogButtons pending={pending} label={t("savePeriod")} onCancel={onClose} disabled={!start || !end} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_OPTIONS = ["ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"] as const;

function SetStatusDialog({ sub, onClose }: { sub: BillingSubscription; onClose: () => void }) {
  const t = useTranslations("admin.student360.billingAdmin");
  const id = React.useId().replace(/:/g, "");
  const options = STATUS_OPTIONS.filter((s) => s !== sub.status);
  const [status, setStatus] = React.useState<(typeof STATUS_OPTIONS)[number]>(options[0]!);
  const [note, setNote] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(setSubscriptionStatusAction, { onSuccess: onClose });
  const ending = status === "CANCELED" || status === "EXPIRED";
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={t("statusTitle")} description={t("statusBody", { plan: sub.planPrice.plan.name, status: t(`status_${sub.status}`) })}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run({ subscriptionId: sub.id, status, note: note || undefined });
          }}
        >
          <Field id={`s-status-${id}`} label={t("status")} hint={t(`statusHint_${status}`)}>
            <Select {...fieldA11y(`s-status-${id}`, undefined, true)} value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUS_OPTIONS)[number])}>
              {options.map((s) => (
                <option key={s} value={s}>
                  {t(`status_${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={`s-note-${id}`} label={t("note")} hint={t("noteHint")} error={fieldErrors.note}>
            <Textarea {...fieldA11y(`s-note-${id}`, fieldErrors.note, true)} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-20" />
          </Field>
          <DialogButtons pending={pending} label={t("confirmStatus", { status: t(`status_${status}`) })} onCancel={onClose} variant={ending ? "danger" : "primary"} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelAtEndDialog({ sub, tz, onClose }: { sub: BillingSubscription; tz: string; onClose: () => void }) {
  const t = useTranslations("admin.student360.billingAdmin");
  const cancel = !sub.cancelAtPeriodEnd;
  const { run, pending } = useServerAction(cancelAtPeriodEndAction, { onSuccess: onClose });
  const end = sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd, tz) : "—";
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={cancel ? t("cancelAtEndTitle") : t("keepTitle")} description={cancel ? t("cancelAtEndBody", { date: end }) : t("keepBody", { date: end })}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run({ subscriptionId: sub.id, cancel });
          }}
        >
          <DialogButtons pending={pending} label={cancel ? t("cancelAtEnd") : t("keep")} onCancel={onClose} variant={cancel ? "danger" : "primary"} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
