"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { PasswordInput } from "@/components/auth/password-input";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { TIMEZONES } from "../employees/employee-form";
import { createStudentAction } from "./actions";

export type StudentFormOptions = { markets: { code: string; name: string; defaultTimezone: string }[]; dialCodes: { code: string; label: string }[] };

/** "New student" (D-147): create the account by invite link or with a password set now. */
export function StudentCreateDialog({ options }: { options: StudentFormOptions }) {
  const t = useTranslations("admin.students.create");
  const tl = useTranslations("admin.students");
  const tc = useTranslations("admin.common");
  const ta = useTranslations("auth");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"invite" | "password">("invite");
  const [market, setMarket] = React.useState(options.markets.length === 1 ? options.markets[0]!.code : "");
  const [phoneCountry, setPhoneCountry] = React.useState("");
  const [timezone, setTimezone] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(createStudentAction, {
    refresh: false,
    onSuccess: (data) => {
      setOpen(false);
      const d = data as { studentId: string } | undefined;
      if (d?.studentId) router.push(`/admin/students/${d.studentId}`);
    },
  });
  const selectedMarket = options.markets.find((m) => m.code === market);
  const tzValue = timezone || selectedMarket?.defaultTimezone || "";
  const tzOptions = [...new Set([tzValue, ...options.markets.map((m) => m.defaultTimezone), ...TIMEZONES])].filter(Boolean);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run({
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      phoneCountry: phoneCountry || market,
      marketCode: market,
      timezone: tzValue,
      mode,
      password: mode === "password" ? String(fd.get("password") ?? "") : null,
      sendEmail: mode === "invite" ? true : fd.get("sendEmail") === "on",
      notes: String(fd.get("notes") ?? ""),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {tl("newStudent")}
        </Button>
      </DialogTrigger>
      <DialogContent wide title={t("title")} description={t("description")}>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field id="st-name" label={t("name")} error={fieldErrors.name}>
            <Input {...fieldA11y("st-name", fieldErrors.name)} name="name" autoComplete="off" required />
          </Field>
          <Field id="st-email" label={t("email")} error={fieldErrors.email}>
            <Input {...fieldA11y("st-email", fieldErrors.email)} name="email" type="email" autoComplete="off" required />
          </Field>
          <Field id="st-market" label={t("market")} error={fieldErrors.marketCode}>
            <Select {...fieldA11y("st-market", fieldErrors.marketCode)} name="marketCode" value={market} onChange={(e) => setMarket(e.target.value)} required>
              <option value="">{t("marketPlaceholder")}</option>
              {options.markets.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name} ({m.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field id="st-phone" label={t("phone")} error={fieldErrors.phone} hint={t("phoneHint")}>
            <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
              <Select aria-label={t("phoneCountry")} value={phoneCountry || market} onChange={(e) => setPhoneCountry(e.target.value)}>
                {!options.dialCodes.some((d) => d.code === (phoneCountry || market)) ? <option value="">—</option> : null}
                {options.dialCodes.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </Select>
              <Input {...fieldA11y("st-phone", fieldErrors.phone, true)} name="phone" type="tel" autoComplete="off" />
            </div>
          </Field>
          <Field id="st-tz" label={t("timezone")} error={fieldErrors.timezone} hint={t("timezoneHint")}>
            <Select {...fieldA11y("st-tz", fieldErrors.timezone, true)} name="timezone" value={tzValue} onChange={(e) => setTimezone(e.target.value)}>
              {!tzValue ? <option value="">—</option> : null}
              {tzOptions.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-semibold">{t("access")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["invite", "password"] as const).map((m) => (
                <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-[12px] border-[1.5px] px-4 py-3 text-sm ${mode === m ? "border-primary bg-accent" : "border-border-strong"}`}>
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1 h-[18px] w-[18px] accent-[var(--primary)]" />
                  <span>
                    <span className="block font-semibold">{t(m === "invite" ? "modeInvite" : "modePassword")}</span>
                    <span className="block text-[13px] text-muted-foreground">{t(m === "invite" ? "modeInviteHint" : "modePasswordHint")}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {mode === "password" ? (
            <>
              <Field id="st-password" label={t("password")} hint={ta("passwordHint")} error={fieldErrors.password}>
                <PasswordInput {...fieldA11y("st-password", fieldErrors.password, true)} name="password" autoComplete="new-password" minLength={10} required showLabel={ta("showPassword")} hideLabel={ta("hidePassword")} />
              </Field>
              <label className="inline-flex min-h-11 items-center gap-2 self-end text-sm">
                <Checkbox name="sendEmail" defaultChecked />
                {t("sendEmail")}
              </label>
            </>
          ) : null}
          <Field id="st-notes" label={t("notes")} hint={t("notesHint")} error={fieldErrors.notes} className="sm:col-span-2">
            <Textarea {...fieldA11y("st-notes", fieldErrors.notes, true)} name="notes" maxLength={10000} className="min-h-20" />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending} disabled={!market}>
              {t(mode === "invite" ? "submitInvite" : "submitPassword")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
