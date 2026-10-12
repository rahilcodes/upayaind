"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { useServerAction } from "@/components/portal/action-form";
import { cn } from "@/lib/utils";

type Result = { ok: true; data?: unknown; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * Inline status quick-change. Offers only the allowed transitions (F5 matrix,
 * passed from the server). Moving to INTERVIEW_SCHEDULED needs interview
 * details, so that option links to the interviews page instead.
 */
export function StatusSelect({
  applicationId,
  status,
  allowed,
  action,
  label,
  className,
}: {
  applicationId: string;
  status: ApplicationStatus;
  allowed: ApplicationStatus[];
  action: (applicationId: string, to: string) => Promise<Result>;
  label: string;
  className?: string;
}) {
  const ts = useTranslations("status");
  const t = useTranslations("work.common");
  const { run, pending } = useServerAction(action);
  const options = allowed.filter((s) => s !== "INTERVIEW_SCHEDULED");
  if (!options.length) return null;
  return (
    <select
      aria-label={label}
      disabled={pending}
      value=""
      onChange={(e) => {
        const to = e.target.value;
        if (to) void run(applicationId, to);
      }}
      className={cn("h-9 max-w-[170px] rounded-[10px] border-[1.5px] border-border-strong bg-surface px-2 text-sm font-medium focus:border-primary focus:outline-none disabled:opacity-60", className)}
    >
      <option value="">{pending ? t("updating") : t("changeStatus")}</option>
      {options.map((s) => (
        <option key={s} value={s}>
          {ts(s)}
        </option>
      ))}
      <option disabled>──────</option>
      <option disabled>{ts(status)} ✓</option>
    </select>
  );
}
