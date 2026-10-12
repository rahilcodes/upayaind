"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CloudUpload, Pencil, Plus, Star } from "lucide-react";
import type { BillingInterval } from "@/generated/prisma/enums";
import { useServerAction } from "@/components/portal/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea, fieldA11y } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { formatMoney, fromMinor, minorDigits, toMinor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { archivePlanAction, createStripePriceAction, savePlanAction, savePriceAction, togglePriceAction } from "./actions";

type Price = {
  id: string;
  planId: string;
  marketId: string;
  interval: BillingInterval;
  amountMinor: number;
  currency: string;
  dailyTarget: number;
  interviewsPromise: string | null;
  providerPriceId: string | null;
  isActive: boolean;
};
type Plan = { id: string; code: string; name: string; description: string | null; features: string[]; isFeatured: boolean; sortOrder: number; isActive: boolean; prices: Price[] };
type Market = { id: string; code: string; name: string; currency: string; locale: string; minPriceMinor: number; isActive: boolean; paymentProvider: string };

// ───────────────────────────── Plan dialog ─────────────────────────────

export function PlanDialog({ mode, plan }: { mode: "create" | "edit"; plan?: Plan }) {
  const t = useTranslations("billing.admin.plans");
  const tf = useTranslations("billing.admin.plans.form");
  const tc = useTranslations("billing.admin.common");
  const [open, setOpen] = React.useState(false);
  const { run, pending, fieldErrors } = useServerAction(savePlanAction, { onSuccess: () => setOpen(false) });
  const archive = useServerAction(archivePlanAction, { onSuccess: () => setOpen(false) });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run({
      id: plan?.id,
      code: String(fd.get("code") ?? ""),
      name: String(fd.get("name") ?? ""),
      description: String(fd.get("description") ?? ""),
      features: String(fd.get("features") ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      isFeatured: fd.get("isFeatured") === "on",
      sortOrder: Number(fd.get("sortOrder") ?? 0),
      isActive: fd.get("isActive") === "on",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("newPlan")}
          </Button>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label={`${t("editPlan")}: ${plan?.name}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={mode === "create" ? t("newPlan") : t("editPlan")} wide>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="plan-name" label={tf("name")} error={fieldErrors.name}>
              <Input {...fieldA11y("plan-name", fieldErrors.name)} name="name" defaultValue={plan?.name} required maxLength={60} />
            </Field>
            <Field id="plan-code" label={tf("code")} hint={tf("codeHint")} error={fieldErrors.code}>
              <Input {...fieldA11y("plan-code", fieldErrors.code, true)} name="code" defaultValue={plan?.code} required maxLength={30} pattern="[a-z0-9-]+" />
            </Field>
          </div>
          <Field id="plan-description" label={tf("description")} error={fieldErrors.description}>
            <Input {...fieldA11y("plan-description", fieldErrors.description)} name="description" defaultValue={plan?.description ?? ""} maxLength={300} />
          </Field>
          <Field id="plan-features" label={tf("features")} hint={tf("featuresHint")} error={fieldErrors.features}>
            <Textarea {...fieldA11y("plan-features", fieldErrors.features, true)} name="features" defaultValue={plan?.features.join("\n")} rows={6} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[160px_1fr] sm:items-end">
            <Field id="plan-sort" label={tf("sortOrder")} error={fieldErrors.sortOrder}>
              <Input {...fieldA11y("plan-sort", fieldErrors.sortOrder)} name="sortOrder" type="number" min={0} max={999} defaultValue={plan?.sortOrder ?? 0} />
            </Field>
            <div className="flex flex-col gap-1">
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <Checkbox name="isFeatured" defaultChecked={plan?.isFeatured} />
                {tf("featured")}
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <Checkbox name="isActive" defaultChecked={plan?.isActive ?? true} />
                {tf("active")}
              </label>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            {plan ? (
              <Button
                type="button"
                variant="ghost"
                className="text-danger"
                loading={archive.pending}
                onClick={() => {
                  if (window.confirm(t("archiveConfirm", { plan: plan.name }))) archive.run(plan.id);
                }}
              >
                {t("archive")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" loading={pending}>
                {tc("save")}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Price dialog ─────────────────────────────

function PriceDialog({ plan, market, interval, price, open, onOpenChange }: { plan: Plan; market: Market; interval: BillingInterval; price?: Price; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations("billing.admin.plans");
  const tf = useTranslations("billing.admin.plans.form");
  const tc = useTranslations("billing.admin.common");
  const ti = useTranslations("interval");
  const { run, pending, fieldErrors } = useServerAction(savePriceAction, { onSuccess: () => onOpenChange(false) });
  const digits = minorDigits(market.currency);
  const [amount, setAmount] = React.useState(price ? fromMinor(price.amountMinor, market.currency).toFixed(digits) : "");
  const [active, setActive] = React.useState(price?.isActive ?? true);
  const amountMinor = amount.trim() === "" || Number.isNaN(Number(amount)) ? null : toMinor(Number(amount), market.currency);
  const belowFloor = amountMinor !== null && active && amountMinor < market.minPriceMinor;
  const minLabel = formatMoney(market.minPriceMinor, market.currency, market.locale);
  const amountError = fieldErrors.amountMinor ?? (belowFloor ? t("belowFloorHint", { min: minLabel }) : undefined);

  React.useEffect(() => {
    if (open) {
      setAmount(price ? fromMinor(price.amountMinor, market.currency).toFixed(digits) : "");
      setActive(price?.isActive ?? true);
    }
  }, [open, price, market.currency, digits]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (belowFloor || amountMinor === null) return;
    const fd = new FormData(e.currentTarget);
    run({
      planId: plan.id,
      marketId: market.id,
      interval,
      amountMinor,
      dailyTarget: Number(fd.get("dailyTarget") ?? 0),
      interviewsPromise: String(fd.get("interviewsPromise") ?? ""),
      providerPriceId: String(fd.get("providerPriceId") ?? ""),
      isActive: active,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={price ? t("editPrice") : t("addPrice")} description={`${plan.name} · ${market.name} · ${ti(interval)}`}>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="price-amount" label={tf("amount")} hint={`${tc("minorUnitsHint", { currency: market.currency })} ${t("minPrice", { amount: minLabel })}`} error={amountError}>
            <div className="relative">
              <Input
                {...fieldA11y("price-amount", amountError, true)}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="pr-16 tabular"
                required
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">{market.currency}</span>
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="price-target" label={tf("dailyTarget")} error={fieldErrors.dailyTarget}>
              <Input {...fieldA11y("price-target", fieldErrors.dailyTarget)} name="dailyTarget" type="number" min={1} max={500} defaultValue={price?.dailyTarget ?? 25} required />
            </Field>
            <Field id="price-interviews" label={tf("interviewsPromise")} hint={tf("interviewsPromiseHint")} error={fieldErrors.interviewsPromise}>
              <Input {...fieldA11y("price-interviews", fieldErrors.interviewsPromise, true)} name="interviewsPromise" defaultValue={price?.interviewsPromise ?? ""} maxLength={60} />
            </Field>
          </div>
          <Field id="price-stripe" label={tf("providerPriceId")} hint={tf("providerPriceIdHint")} error={fieldErrors.providerPriceId}>
            <Input {...fieldA11y("price-stripe", fieldErrors.providerPriceId, true)} name="providerPriceId" defaultValue={price?.providerPriceId ?? ""} placeholder="price_…" className="font-mono text-sm" />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />
            {tf("priceActive")}
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending} disabled={belowFloor || amountMinor === null}>
              {tc("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Matrix ─────────────────────────────

function PriceCell({ plan, market, interval, price, stripeReady }: { plan: Plan; market: Market; interval: BillingInterval; price?: Price; stripeReady: boolean }) {
  const t = useTranslations("billing.admin.plans");
  const ti = useTranslations("interval");
  const [open, setOpen] = React.useState(false);
  const toggle = useServerAction(togglePriceAction);
  const stripe = useServerAction(createStripePriceAction);
  const belowFloor = price ? price.amountMinor < market.minPriceMinor : false;

  if (!price) {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-muted-foreground" aria-label={`${t("addPrice")}: ${plan.name}, ${market.name}, ${ti(interval)}`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("addPrice")}
        </Button>
        <PriceDialog plan={plan} market={market} interval={interval} open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <div className={cn("flex min-w-[180px] flex-col gap-1.5", !price.isActive && "opacity-70")}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen(true)} className="group -m-1 rounded-[8px] p-1 text-left hover:bg-surface-muted" aria-label={`${t("editPrice")}: ${plan.name}, ${market.name}, ${ti(interval)}`}>
          <span className="tabular block text-[15px] font-bold">{formatMoney(price.amountMinor, price.currency, market.locale)}</span>
          <span className="block text-[12px] text-muted-foreground">
            {t("perDay", { count: price.dailyTarget })}
            {price.interviewsPromise ? ` · ${price.interviewsPromise}` : ""}
          </span>
        </button>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <span className="relative inline-flex">
            <input
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={price.isActive}
              disabled={toggle.pending || (!price.isActive && belowFloor)}
              onChange={(e) => toggle.run(price.id, e.target.checked)}
              aria-label={t("toggleActiveLabel", { plan: plan.name, interval: ti(interval), market: market.name })}
            />
            <span className="h-5 w-9 rounded-full bg-border-strong transition-colors peer-checked:bg-success peer-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
          </span>
        </label>
      </div>
      {belowFloor ? (
        <Badge tone="red" className="w-fit">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {t("belowFloor")}
        </Badge>
      ) : null}
      {price.providerPriceId ? (
        <code className="truncate text-[11px] text-muted-foreground" title={price.providerPriceId}>
          {price.providerPriceId}
        </code>
      ) : (
        <Button variant="outline" size="sm" className="h-8 w-fit px-2.5 text-[12px]" disabled={!stripeReady || belowFloor || price.amountMinor <= 0} loading={stripe.pending} onClick={() => stripe.run(price.id)}>
          <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
          {t("createInStripe")}
        </Button>
      )}
      <PriceDialog plan={plan} market={market} interval={interval} price={price} open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function PlansMatrix({ plans, markets, intervals, stripeReady }: { plans: Plan[]; markets: Market[]; intervals: BillingInterval[]; stripeReady: boolean }) {
  const t = useTranslations("billing.admin.plans");
  const tcm = useTranslations("billing.admin.common");
  const ti = useTranslations("interval");
  const first = markets.find((m) => m.isActive) ?? markets[0]!;

  return (
    <Tabs defaultValue={first.id}>
      <TabsList aria-label={t("market")} className="mb-4">
        {markets.map((m) => (
          <TabsTrigger key={m.id} value={m.id}>
            {m.name}
            {!m.isActive ? <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">({tcm("inactive")})</span> : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {markets.map((m) => {
        return (
          <TabsContent key={m.id} value={m.id} className="focus-visible:outline-none">
            <p className="mb-3 text-sm text-muted-foreground">
              {m.currency} · {t("minPrice", { amount: formatMoney(m.minPriceMinor, m.currency, m.locale) })}
            </p>
            <TableWrap>
              <Table className="min-w-[860px]">
                <THead>
                  <tr>
                    <TH className="w-[240px]">{t("plan")}</TH>
                    {intervals.map((iv) => (
                      <TH key={iv}>{ti(iv)}</TH>
                    ))}
                  </tr>
                </THead>
                <tbody>
                  {plans.map((p) => {
                    return (
                      <TR key={p.id} className={cn(!p.isActive && "bg-surface-muted/60")}>
                        <TD className="align-top">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold">{p.name}</p>
                              <p className="text-[12px] text-muted-foreground">
                                {p.code} · {t("sort", { n: p.sortOrder })}
                              </p>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {p.isFeatured ? (
                                  <Badge tone="blue">
                                    <Star className="h-3 w-3" aria-hidden="true" />
                                    {t("featured")}
                                  </Badge>
                                ) : null}
                                {!p.isActive ? <Badge tone="grey">{t("archived")}</Badge> : null}
                              </div>
                            </div>
                            <PlanDialog mode="edit" plan={p} />
                          </div>
                        </TD>
                        {intervals.map((iv) => (
                          <TD key={iv} className="align-top">
                            <PriceCell plan={p} market={m} interval={iv} price={p.prices.find((x) => x.marketId === m.id && x.interval === iv)} stripeReady={stripeReady && m.paymentProvider === "STRIPE"} />
                          </TD>
                        ))}
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
