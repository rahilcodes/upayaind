"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil, UserPlus } from "lucide-react";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, fieldA11y } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";
import { createEmployeeAction, updateEmployeeAction } from "./actions";

export type EmployeeFormOptions = { markets: { id: string; code: string; name: string }[]; managers: { id: string; name: string }[]; defaultMax: number };
export type EmployeeFormValue = {
  employeeId: string;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  marketIds: string[];
  maxStudents: number;
  managerId: string | null;
  timezone: string;
  /** Working window (D-139): start → end in the window's own zone; `hours` is derived server-side. */
  schedule: { days: number[]; startTime: string; endTime: string; timezone: string | null; enforceWindow: boolean };
  role: "EMPLOYEE" | "MANAGER" | "TEAM_LEAD" | "COACH";
  acceptingNewStudents: boolean;
};

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
/** Common zones for staff / student account forms (the student's own profile offers the full IANA list). */
export const TIMEZONES = ["Asia/Kolkata", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney", "UTC"];
const DEFAULT_WINDOW_TZ = "America/New_York";

/** "HH:mm" → minutes; length of a start→end window that may cross midnight. */
const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
function windowLength(start: string, end: string) {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
  const len = toMin(end) > toMin(start) ? toMin(end) - toMin(start) : toMin(end) + 24 * 60 - toMin(start);
  return Math.round((len / 60) * 10) / 10;
}

/** Create (no `value`) or edit an employee. */
export function EmployeeFormDialog({ options, value, canManageManagers }: { options: EmployeeFormOptions; value?: EmployeeFormValue; canManageManagers: boolean }) {
  const t = useTranslations("admin.employees.form");
  const tc = useTranslations("admin.common");
  const td = useTranslations("admin.days");
  const [open, setOpen] = React.useState(false);
  const editing = Boolean(value);
  const [days, setDays] = React.useState<number[]>(value?.schedule.days ?? [1, 2, 3, 4, 5]);
  const [markets, setMarkets] = React.useState<string[]>(value?.marketIds ?? (options.markets.length === 1 ? [options.markets[0]!.id] : []));
  const [startTime, setStartTime] = React.useState(value?.schedule.startTime ?? "09:30");
  const [endTime, setEndTime] = React.useState(value?.schedule.endTime ?? "18:30");
  const windowHours = windowLength(startTime, endTime);
  const create = useServerAction(createEmployeeAction, { onSuccess: () => setOpen(false) });
  const update = useServerAction(updateEmployeeAction, { onSuccess: () => setOpen(false) });
  const { pending, fieldErrors } = editing ? update : create;
  const err = (k: string) => fieldErrors[k] ?? fieldErrors[`schedule.${k}`];
  const managerLocked = (value?.role === "MANAGER" || value?.role === "TEAM_LEAD") && !canManageManagers;
  const [mode, setMode] = React.useState<"invite" | "password">("invite");
  const tp = useTranslations("admin.setPassword");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? value?.email ?? ""),
      phone: String(fd.get("phone") ?? ""),
      title: String(fd.get("title") ?? ""),
      marketIds: markets,
      maxStudents: Number(fd.get("maxStudents") ?? options.defaultMax),
      managerId: String(fd.get("managerId") ?? "") || null,
      timezone: String(fd.get("timezone") ?? "Asia/Kolkata"),
      schedule: {
        days,
        startTime: String(fd.get("startTime") ?? "09:30"),
        endTime: String(fd.get("endTime") ?? "18:30"),
        timezone: String(fd.get("windowTimezone") ?? DEFAULT_WINDOW_TZ),
        enforceWindow: fd.get("enforceWindow") === "on",
      },
      role: (String(fd.get("role") ?? "EMPLOYEE") as "EMPLOYEE" | "MANAGER" | "TEAM_LEAD" | "COACH"),
      acceptingNewStudents: fd.get("accepting") === "on",
      mode: editing ? ("invite" as const) : mode,
      password: editing || mode !== "password" ? null : String(fd.get("password") ?? ""),
    };
    if (value) update.run({ ...payload, employeeId: value.employeeId });
    else create.run(payload);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setDays(value?.schedule.days ?? [1, 2, 3, 4, 5]);
          setStartTime(value?.schedule.startTime ?? "09:30");
          setEndTime(value?.schedule.endTime ?? "18:30");
          setMarkets(value?.marketIds ?? (options.markets.length === 1 ? [options.markets[0]!.id] : []));
        }
      }}
    >
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="outline" size="sm" disabled={managerLocked}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {tc("edit")}
          </Button>
        ) : (
          <Button>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {t("create")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent wide title={editing ? t("editTitle", { name: value!.name }) : t("createTitle")} description={editing ? undefined : t("createDescription")}>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field id="emp-name" label={t("name")} error={err("name")}>
            <Input {...fieldA11y("emp-name", err("name"))} name="name" defaultValue={value?.name} autoComplete="off" required />
          </Field>
          <Field id="emp-email" label={t("email")} error={err("email")} hint={editing ? t("emailLocked") : undefined}>
            <Input {...fieldA11y("emp-email", err("email"), editing)} name="email" type="email" defaultValue={value?.email} disabled={editing} autoComplete="off" required />
          </Field>
          <Field id="emp-phone" label={t("phone")} error={err("phone")} hint={t("phoneHint")}>
            <Input {...fieldA11y("emp-phone", err("phone"), true)} name="phone" type="tel" defaultValue={value?.phone ?? ""} />
          </Field>
          <Field id="emp-title" label={t("title")} error={err("title")}>
            <Input {...fieldA11y("emp-title", err("title"))} name="title" defaultValue={value?.title ?? "Job Application Specialist"} />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-semibold">{t("markets")}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {options.markets.map((m) => (
                <label key={m.id} className="inline-flex min-h-11 items-center gap-2 text-sm">
                  <Checkbox checked={markets.includes(m.id)} onChange={(e) => setMarkets((cur) => (e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id)))} />
                  {m.name} ({m.code})
                </label>
              ))}
            </div>
            {err("marketIds") ? (
              <p role="alert" className="mt-1 text-[13px] font-medium text-danger">
                {err("marketIds")}
              </p>
            ) : null}
          </fieldset>
          <Field id="emp-max" label={t("maxStudents")} error={err("maxStudents")} hint={t("maxHint", { n: options.defaultMax })}>
            <Input {...fieldA11y("emp-max", err("maxStudents"), true)} name="maxStudents" type="number" min={0} max={100} inputMode="numeric" defaultValue={value?.maxStudents ?? options.defaultMax} className="tabular" />
          </Field>
          <Field id="emp-manager" label={t("manager")} error={err("managerId")}>
            <Select {...fieldA11y("emp-manager", err("managerId"))} name="managerId" defaultValue={value?.managerId ?? ""}>
              <option value="">{tc("none")}</option>
              {options.managers
                .filter((m) => m.id !== value?.employeeId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field id="emp-role" label={t("role")} error={err("role")} hint={canManageManagers ? undefined : t("roleHint")}>
            <Select {...fieldA11y("emp-role", err("role"), !canManageManagers)} name="role" defaultValue={value?.role ?? "EMPLOYEE"} disabled={!canManageManagers}>
              <option value="EMPLOYEE">{t("roleEmployee")}</option>
              {canManageManagers ? <option value="MANAGER">{t("roleManager")}</option> : null}
              {canManageManagers ? <option value="TEAM_LEAD">{t("roleTeamLead")}</option> : null}
              <option value="COACH">{t("roleCoach")}</option>
            </Select>
          </Field>
          {!editing ? (
            <Field id="emp-mode" label={t("mode")} error={err("mode")}>
              <Select {...fieldA11y("emp-mode", err("mode"))} name="mode" value={mode} onChange={(e) => setMode(e.target.value as "invite" | "password")}>
                <option value="invite">{t("modeInvite")}</option>
                <option value="password">{t("modePassword")}</option>
              </Select>
            </Field>
          ) : null}
          {!editing && mode === "password" ? (
            <Field id="emp-password" label={t("password")} hint={t("passwordHint")} error={err("password")}>
              <PasswordInput {...fieldA11y("emp-password", err("password"))} name="password" autoComplete="new-password" minLength={10} required showLabel={tp("show")} hideLabel={tp("hide")} />
            </Field>
          ) : null}
          <Field id="emp-tz" label={t("timezone")} error={err("timezone")}>
            <Select {...fieldA11y("emp-tz", err("timezone"))} name="timezone" defaultValue={value?.timezone ?? "Asia/Kolkata"}>
              {[...new Set([value?.timezone ?? "Asia/Kolkata", ...TIMEZONES])].map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-semibold">{t("schedule")}</legend>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("workingDays")}>
              {DAYS.map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d].sort()))}
                    className={`min-h-11 min-w-12 rounded-[10px] border-[1.5px] px-3 text-sm font-semibold ${on ? "border-primary bg-accent text-accent-foreground" : "border-border-strong text-muted-foreground"}`}
                  >
                    {td(String(d) as "1")}
                  </button>
                );
              })}
            </div>
            {err("days") ? (
              <p role="alert" className="mt-1 text-[13px] font-medium text-danger">
                {err("days")}
              </p>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field id="emp-start" label={t("startTime")} error={err("startTime")}>
                <Input {...fieldA11y("emp-start", err("startTime"))} name="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </Field>
              <Field id="emp-end" label={t("endTime")} error={err("endTime")} hint={windowHours ? t("windowHours", { h: windowHours }) : undefined}>
                <Input {...fieldA11y("emp-end", err("endTime"), Boolean(windowHours))} name="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
              </Field>
              <Field id="emp-window-tz" label={t("windowTimezone")} error={err("timezone")} hint={t("windowTimezoneHint")}>
                <Select {...fieldA11y("emp-window-tz", err("timezone"), true)} name="windowTimezone" defaultValue={value?.schedule.timezone ?? DEFAULT_WINDOW_TZ}>
                  {[...new Set([value?.schedule.timezone ?? DEFAULT_WINDOW_TZ, ...TIMEZONES])].map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <label className="mt-3 inline-flex min-h-11 items-start gap-2 text-sm">
              <Checkbox name="enforceWindow" defaultChecked={value?.schedule.enforceWindow ?? false} className="mt-1" />
              <span>
                {t("enforceWindow")}
                <span className="block text-[13px] text-muted-foreground">{t("enforceWindowHint")}</span>
              </span>
            </label>
          </fieldset>
          <label className="inline-flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
            <Checkbox name="accepting" defaultChecked={value?.acceptingNewStudents ?? true} />
            {t("accepting")}
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? tc("saveChanges") : mode === "password" ? t("createSubmitPassword") : t("createSubmit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
