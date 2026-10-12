"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus } from "lucide-react";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, fieldA11y } from "@/components/ui/input";
import { fromMinor, minorDigits, toMinor } from "@/lib/format";
import { saveMarketAction } from "./actions";

type Style = { id: string; name: string; code: string };
type Market = {
  id: string;
  code: string;
  name: string;
  currency: string;
  locale: string;
  defaultTimezone: string;
  workingDays: number[];
  paymentProvider: string;
  phoneDisplay: string | null;
  whatsapp: string | null;
  minPriceMinor: number;
  resumeStyleId: string;
  isActive: boolean;
};

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function MarketDialog({ styles, market }: { styles: Style[]; market?: Market }) {
  const t = useTranslations("billing.admin.markets");
  const tf = useTranslations("billing.admin.markets.form");
  const tc = useTranslations("billing.admin.common");
  const [open, setOpen] = React.useState(false);
  const [currency, setCurrency] = React.useState(market?.currency ?? "USD");
  const { run, pending, fieldErrors } = useServerAction(saveMarketAction, { onSuccess: () => setOpen(false) });
  const validCurrency = /^[A-Z]{3}$/.test(currency);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const minPrice = Number(fd.get("minPrice") ?? 0);
    run({
      id: market?.id,
      code: String(fd.get("code") ?? ""),
      name: String(fd.get("name") ?? ""),
      currency,
      locale: String(fd.get("locale") ?? ""),
      defaultTimezone: String(fd.get("defaultTimezone") ?? ""),
      workingDays: fd.getAll("workingDays").map(Number),
      paymentProvider: String(fd.get("paymentProvider") ?? "STRIPE") as "STRIPE" | "RAZORPAY",
      phoneDisplay: String(fd.get("phoneDisplay") ?? ""),
      whatsapp: String(fd.get("whatsapp") ?? ""),
      minPriceMinor: validCurrency && Number.isFinite(minPrice) ? toMinor(minPrice, currency) : -1,
      resumeStyleId: String(fd.get("resumeStyleId") ?? ""),
      isActive: fd.get("isActive") === "on",
    });
  };

  const digits = validCurrency ? minorDigits(currency) : 2;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {market ? (
          <Button variant="ghost" size="icon-sm" aria-label={`${t("editMarket")}: ${market.name}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("newMarket")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={market ? t("editMarket") : t("newMarket")} wide>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <Field id="m-code" label={tf("code")} hint={tf("codeHint")} error={fieldErrors.code}>
              <Input {...fieldA11y("m-code", fieldErrors.code, true)} name="code" defaultValue={market?.code} maxLength={2} className="uppercase" required />
            </Field>
            <Field id="m-name" label={tf("name")} error={fieldErrors.name}>
              <Input {...fieldA11y("m-name", fieldErrors.name)} name="name" defaultValue={market?.name} maxLength={60} required />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="m-currency" label={tf("currency")} hint={tf("currencyHint")} error={fieldErrors.currency}>
              <Input {...fieldA11y("m-currency", fieldErrors.currency, true)} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} className="uppercase" required />
            </Field>
            <Field id="m-locale" label={tf("locale")} hint={tf("localeHint")} error={fieldErrors.locale}>
              <Input {...fieldA11y("m-locale", fieldErrors.locale, true)} name="locale" defaultValue={market?.locale ?? "en-US"} required />
            </Field>
            <Field id="m-min" label={tf("minPrice")} hint={tf("minPriceHint")} error={fieldErrors.minPriceMinor}>
              <Input
                {...fieldA11y("m-min", fieldErrors.minPriceMinor, true)}
                name="minPrice"
                type="number"
                min={0}
                step={1 / 10 ** digits}
                defaultValue={market ? fromMinor(market.minPriceMinor, market.currency) : ""}
                className="tabular"
                required
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="m-tz" label={tf("timezone")} hint={tf("timezoneHint")} error={fieldErrors.defaultTimezone}>
              <Input {...fieldA11y("m-tz", fieldErrors.defaultTimezone, true)} name="defaultTimezone" defaultValue={market?.defaultTimezone ?? "America/New_York"} required />
            </Field>
            <Field id="m-style" label={tf("resumeStyle")} error={fieldErrors.resumeStyleId}>
              <Select {...fieldA11y("m-style", fieldErrors.resumeStyleId)} name="resumeStyleId" defaultValue={market?.resumeStyleId ?? styles[0]?.id}>
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <fieldset>
            <legend className="text-sm font-semibold">{tf("workingDays")}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <label key={d} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-border-strong px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
                  <Checkbox name="workingDays" value={d} defaultChecked={(market?.workingDays ?? [1, 2, 3, 4, 5]).includes(d)} />
                  {t(`weekday.${d}`)}
                </label>
              ))}
            </div>
            {fieldErrors.workingDays ? (
              <p role="alert" className="mt-1.5 text-[13px] font-medium text-danger">
                {fieldErrors.workingDays[0]}
              </p>
            ) : null}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="m-provider" label={tf("provider")} error={fieldErrors.paymentProvider}>
              <Select {...fieldA11y("m-provider", fieldErrors.paymentProvider)} name="paymentProvider" defaultValue={market?.paymentProvider ?? "STRIPE"}>
                <option value="STRIPE">{t("providerName.STRIPE")}</option>
                <option value="RAZORPAY">{t("providerName.RAZORPAY")}</option>
              </Select>
            </Field>
            <Field id="m-phone" label={tf("phone")} error={fieldErrors.phoneDisplay}>
              <Input {...fieldA11y("m-phone", fieldErrors.phoneDisplay)} name="phoneDisplay" defaultValue={market?.phoneDisplay ?? ""} maxLength={40} type="tel" />
            </Field>
            <Field id="m-wa" label={tf("whatsapp")} hint={tf("whatsappHint")} error={fieldErrors.whatsapp}>
              <Input {...fieldA11y("m-wa", fieldErrors.whatsapp, true)} name="whatsapp" defaultValue={market?.whatsapp ?? ""} maxLength={40} inputMode="tel" />
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox name="isActive" defaultChecked={market?.isActive ?? false} />
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
