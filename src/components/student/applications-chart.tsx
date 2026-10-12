"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { day: string; applied: number; target: number };

function label(day: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

/**
 * F6 chart: applications per day for the last 30 days (bars, brand blue) with
 * the plan's daily target as a dashed reference line. Weekend/holiday bars
 * have target 0. A visually-hidden table carries the same data.
 */
export function ApplicationsChart({ data, target }: { data: Point[]; target: number }) {
  const t = useTranslations("student.dashboard.chart");
  const max = Math.max(target, ...data.map((d) => d.applied), 5);
  const total = data.reduce((n, d) => n + d.applied, 0);
  return (
    <figure className="m-0">
      <div className="h-[220px] w-full sm:h-[260px]" aria-hidden="true" inert>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 8, left: -18, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              tickFormatter={(d: string) => label(d, { month: "short", day: "numeric" })}
            />
            <YAxis allowDecimals={false} domain={[0, Math.ceil(max * 1.1)]} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
            <Tooltip
              cursor={{ fill: "var(--surface-muted)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as Point;
                return (
                  <div className="rounded-[10px] border border-border bg-surface px-3 py-2 text-sm shadow-[var(--shadow-card)]">
                    <p className="text-[15px] font-bold tabular">{t("tooltipApplied", { count: p.applied })}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {label(p.day, { weekday: "short", month: "short", day: "numeric" })} · {p.target ? t("tooltipTarget", { target: p.target }) : t("noTargetDay")}
                    </p>
                  </div>
                );
              }}
            />
            {target > 0 ? <ReferenceLine y={target} stroke="var(--color-warning)" strokeDasharray="5 4" strokeWidth={2} ifOverflow="extendDomain" /> : null}
            <Bar dataKey="applied" fill="var(--color-blue)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-3 rounded-[3px] bg-blue" />
          {t("legendApplied", { total })}
        </span>
        {target > 0 ? (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-0 w-5 border-t-2 border-dashed border-warning" />
            {t("legendTarget", { target })}
          </span>
        ) : null}
      </figcaption>
      <table className="sr-only">
        <caption>{t("tableCaption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("date")}</th>
            <th scope="col">{t("applied")}</th>
            <th scope="col">{t("target")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{label(d.day, { weekday: "short", month: "short", day: "numeric" })}</td>
              <td>{d.applied}</td>
              <td>{d.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
