"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil, UserPlus } from "lucide-react";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, fieldA11y } from "@/components/ui/input";
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
  schedule: { days: number[]; startTime: string; hours: number };
  role: "EMPLOYEE" | "MANAGER";
  acceptingNewStudents: boolean;
};

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const TIMEZONES = ["Asia/Kolkata", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney", "UTC"];

/** Create (no `value`) or edit an employee. */
export function EmployeeFormDialog({ options, value, canManageManagers }: { options: EmployeeFormOptions; value?: EmployeeFormValue; canManageManagers: boolean }) {
  const t = useTranslations("admin.employees.form");
  const tc = useTranslations("admin.common");
  const td = useTranslations("admin.days");
  const [open, setOpen] = React.useState(false);
  const editing = Boolean(value);
  const [days, setDays] = React.useState<number[]>(value?.schedule.days ?? [1, 2, 3, 4, 5]);
  const [markets, setMarkets] = React.useState<string[]>(value?.marketIds ?? (options.markets.length === 1 ? [options.markets[0]!.id] : []));
  const create = useServerAction(createEmployeeAction, { onSuccess: () => setOpen(false) });
  const update = useServerAction(updateEmployeeAction, { onSuccess: () => setOpen(false) });
  const { pending, fieldErrors } = editing ? update : create;
  const err = (k: string) => fieldErrors[k] ?? fieldErrors[`schedule.${k}`];
  const managerLocked = value?.role === "MANAGER" && !canManageManagers;

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
      schedule: { days, startTime: String(fd.get("startTime") ?? "09:30"), hours: Number(fd.get("hours") ?? 9) },
      role: (String(fd.get("role") ?? "EMPLOYEE") as "EMPLOYEE" | "MANAGER"),
      acceptingNewStudents: fd.get("accepting") === "on",
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
            </Select>
          </Field>
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
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Field id="emp-start" label={t("startTime")} error={err("startTime")}>
                <Input {...fieldA11y("emp-start", err("startTime"))} name="startTime" type="time" defaultValue={value?.schedule.startTime ?? "09:30"} />
              </Field>
              <Field id="emp-hours" label={t("hours")} error={err("hours")}>
                <Input {...fieldA11y("emp-hours", err("hours"))} name="hours" type="number" min={1} max={14} step={0.5} defaultValue={value?.schedule.hours ?? 9} className="tabular" />
              </Field>
            </div>
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
              {editing ? tc("saveChanges") : t("createSubmit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
