"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Ban, KeyRound, LogOut, MailCheck, Pencil, Play, Send } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { SetPasswordDialog } from "@/components/admin/set-password-dialog";
import { useServerAction } from "@/components/portal/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { TIMEZONES } from "../../employees/employee-form";
import type { StudentFormOptions } from "../student-create-dialog";
import {
  markStudentVerifiedAction,
  reactivateStudentAction,
  resendStudentInviteAction,
  resendStudentVerificationAction,
  sendStudentPasswordResetAction,
  setStudentPasswordAction,
  signOutStudentEverywhereAction,
  suspendStudentAction,
  updateStudentAccountAction,
  updateStudentLinksAction,
} from "../actions";

export type AccountValue = { name: string; email: string; phone: string; timezone: string; marketCode: string; status: "ACTIVE" | "INVITED" | "SUSPENDED" | "DEACTIVATED" };

/** Edit name / email / phone / time zone / market / status (D-147). */
export function AccountEditDialog({ studentId, value, options }: { studentId: string; value: AccountValue; options: StudentFormOptions }) {
  const t = useTranslations("admin.student360.edit");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ ...value, phoneCountry: value.marketCode, reason: "" });
  const { run, pending, fieldErrors } = useServerAction(updateStudentAccountAction, { onSuccess: () => setOpen(false) });
  const statusEditable = value.status === "ACTIVE" || value.status === "SUSPENDED";
  const suspending = statusEditable && v.status === "SUSPENDED" && value.status !== "SUSPENDED";
  const tzOptions = [...new Set([v.timezone, ...options.markets.map((m) => m.defaultTimezone), ...TIMEZONES])].filter(Boolean);
  const marketOptions = options.markets.some((m) => m.code === value.marketCode) ? options.markets : [{ code: value.marketCode, name: value.marketCode, defaultTimezone: value.timezone }, ...options.markets];
  const set = (patch: Partial<typeof v>) => setV((cur) => ({ ...cur, ...patch }));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV({ ...value, phoneCountry: value.marketCode, reason: "" });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {t("account")}
        </Button>
      </DialogTrigger>
      <DialogContent wide title={t("accountTitle")} description={t("accountDescription")}>
        <form
          noValidate
          className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            run(studentId, {
              name: v.name,
              email: v.email,
              phone: v.phone,
              phoneCountry: v.phoneCountry,
              timezone: v.timezone,
              marketCode: v.marketCode,
              status: statusEditable && (v.status === "ACTIVE" || v.status === "SUSPENDED") ? v.status : null,
              reason: suspending ? v.reason : null,
            });
          }}
        >
          <Field id="ac-name" label={t("name")} error={fieldErrors.name}>
            <Input {...fieldA11y("ac-name", fieldErrors.name)} value={v.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" required />
          </Field>
          <Field id="ac-email" label={t("email")} error={fieldErrors.email}>
            <Input {...fieldA11y("ac-email", fieldErrors.email)} type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} autoComplete="off" required />
          </Field>
          <Field id="ac-phone" label={t("phone")} error={fieldErrors.phone}>
            <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
              <Select aria-label={t("phoneCountry")} value={v.phoneCountry} onChange={(e) => set({ phoneCountry: e.target.value })}>
                {!options.dialCodes.some((d) => d.code === v.phoneCountry) ? <option value={v.phoneCountry}>—</option> : null}
                {options.dialCodes.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </Select>
              <Input {...fieldA11y("ac-phone", fieldErrors.phone)} type="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="off" />
            </div>
          </Field>
          <Field id="ac-tz" label={t("timezone")} error={fieldErrors.timezone}>
            <Select {...fieldA11y("ac-tz", fieldErrors.timezone)} value={v.timezone} onChange={(e) => set({ timezone: e.target.value })}>
              {tzOptions.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="ac-market" label={t("market")} hint={t("marketHint")} error={fieldErrors.marketCode}>
            <Select {...fieldA11y("ac-market", fieldErrors.marketCode, true)} value={v.marketCode} onChange={(e) => set({ marketCode: e.target.value, phoneCountry: e.target.value })}>
              {marketOptions.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name} ({m.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field id="ac-status" label={t("status")} hint={statusEditable ? undefined : t("statusLocked", { status: value.status.toLowerCase() })} error={fieldErrors.status}>
            <Select {...fieldA11y("ac-status", fieldErrors.status, !statusEditable)} value={statusEditable ? v.status : value.status} onChange={(e) => set({ status: e.target.value as AccountValue["status"] })} disabled={!statusEditable}>
              <option value="ACTIVE">{t("statusActive")}</option>
              <option value="SUSPENDED">{t("statusSuspended")}</option>
              {!statusEditable ? <option value={value.status}>{value.status}</option> : null}
            </Select>
          </Field>
          {suspending ? (
            <Field id="ac-reason" label={t("reason")} hint={t("reasonHint")} error={fieldErrors.reason} className="sm:col-span-2">
              <Textarea {...fieldA11y("ac-reason", fieldErrors.reason, true)} value={v.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={500} className="min-h-20" required />
            </Field>
          ) : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending} disabled={suspending && v.reason.trim().length < 3}>
              {tc("saveChanges")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LinksEditDialog({ studentId, value }: { studentId: string; value: { linkedinUrl: string; githubUrl: string; portfolioUrl: string } }) {
  const t = useTranslations("admin.student360.edit");
  const tl = useTranslations("student.onboarding.links");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(value);
  const { run, pending, fieldErrors } = useServerAction(updateStudentLinksAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(value);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {t("links")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("linksTitle")}>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(studentId, v);
          }}
        >
          {(["linkedinUrl", "githubUrl", "portfolioUrl"] as const).map((k) => (
            <Field key={k} id={`lk-${k}`} label={tl(k)} error={fieldErrors[k]}>
              <Input {...fieldA11y(`lk-${k}`, fieldErrors[k])} inputMode="url" placeholder="https://" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
            </Field>
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {tc("saveChanges")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Access tab: status + verification at a glance, and the account actions (D-147). */
export function AccountAccessActions({ studentId, status, emailVerified, name }: { studentId: string; status: AccountValue["status"]; emailVerified: boolean; name: string }) {
  const t = useTranslations("admin.student360.account");
  const setPassword = React.useCallback((input: { password: string; signOutOthers: boolean }) => setStudentPasswordAction(studentId, input), [studentId]);
  const reset = React.useCallback(() => sendStudentPasswordResetAction(studentId), [studentId]);
  const invite = React.useCallback(() => resendStudentInviteAction(studentId), [studentId]);
  const verify = useServerAction(resendStudentVerificationAction);
  const markVerified = React.useCallback(() => markStudentVerifiedAction(studentId), [studentId]);
  const suspend = React.useCallback((reason: string) => suspendStudentAction(studentId, reason), [studentId]);
  const reactivate = React.useCallback(() => reactivateStudentAction(studentId), [studentId]);
  const signOut = React.useCallback(() => signOutStudentEverywhereAction(studentId), [studentId]);
  const deactivated = status === "DEACTIVATED";
  return (
    <div className="flex flex-wrap gap-2">
      {!deactivated ? <SetPasswordDialog action={setPassword} name={name} /> : null}
      {!deactivated ? (
        <ConfirmAction trigger={<><KeyRound className="h-4 w-4" aria-hidden="true" />{t("sendReset")}</>} title={t("sendResetTitle")} description={t("sendResetBody")} confirmLabel={t("confirm")} confirmVariant="primary" action={reset} />
      ) : null}
      {status === "INVITED" ? (
        <ConfirmAction trigger={<><Send className="h-4 w-4" aria-hidden="true" />{t("resendInvite")}</>} title={t("resendInviteTitle")} description={t("resendInviteBody")} confirmLabel={t("confirm")} confirmVariant="primary" action={invite} />
      ) : null}
      {!emailVerified && !deactivated ? (
        <>
          <Button variant="outline" size="sm" loading={verify.pending} onClick={() => verify.run(studentId)}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {t("resendVerification")}
          </Button>
          <ConfirmAction trigger={<><MailCheck className="h-4 w-4" aria-hidden="true" />{t("markVerified")}</>} title={t("markVerifiedTitle")} description={t("markVerifiedBody")} confirmLabel={t("confirm")} confirmVariant="primary" action={markVerified} />
        </>
      ) : null}
      {status === "SUSPENDED" ? (
        <ConfirmAction trigger={<><Play className="h-4 w-4" aria-hidden="true" />{t("reactivate")}</>} title={t("reactivateTitle")} description={t("reactivateBody")} confirmLabel={t("reactivate")} confirmVariant="primary" action={reactivate} />
      ) : !deactivated ? (
        <ConfirmAction trigger={<><Ban className="h-4 w-4" aria-hidden="true" />{t("suspend")}</>} triggerVariant="danger" title={t("suspendTitle")} description={t("suspendBody")} confirmLabel={t("suspend")} reasonLabel={t("suspendReason")} reasonHint={t("suspendReasonHint")} action={suspend} />
      ) : null}
      {!deactivated ? (
        <ConfirmAction trigger={<><LogOut className="h-4 w-4" aria-hidden="true" />{t("signOut")}</>} title={t("signOutTitle")} description={t("signOutBody")} confirmLabel={t("signOut")} confirmVariant="primary" action={signOut} />
      ) : null}
    </div>
  );
}

export function AccountStatusBadge({ status }: { status: AccountValue["status"] }) {
  const t = useTranslations("admin.student360.account");
  const tone = status === "ACTIVE" ? "green" : status === "INVITED" ? "amber" : "red";
  return <Badge tone={tone}>{t(`statusLabel.${status}`)}</Badge>;
}
