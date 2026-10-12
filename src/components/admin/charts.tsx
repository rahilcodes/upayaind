"use client";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, fromMinor } from "@/lib/format";

/**
 * Admin charts (recharts). One series per chart in the brand primary; revenue
 * is drawn as small multiples (one chart per currency) because amounts in
 * different currencies must never share an axis or be added up.
 * Colours come from CSS tokens so portal dark mode works.
 */

const AXIS = { fontSize: 12, fill: "var(--muted-foreground)" };

function TooltipBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] shadow-[var(--shadow-card)]">
      <p className="text-muted-foreground">{title}</p>
      <p className="tabular font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function DailyBarChart({ data, label, height = 220 }: { data: { day: string; label: string; count: number }[]; label: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, Math.ceil(max * 1.1)]} width={44} />
          <Tooltip cursor={{ fill: "var(--surface-muted)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={String(payload[0].payload.label)} value={String(payload[0].value)} /> : null)} />
          <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueChart({ currency, locale, data, label, height = 180 }: { currency: string; locale?: string; data: { month: string; label: string; netMinor: number }[]; label: string; height?: number }) {
  const fmt = (v: number) => formatMoney(v, currency, locale);
  const short = (v: number) =>
    new Intl.NumberFormat(locale ?? "en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(fromMinor(v, currency));
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={4}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} width={56} />
          <Tooltip cursor={{ fill: "var(--surface-muted)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={`${payload[0].payload.label} · ${currency}`} value={fmt(Number(payload[0].value))} /> : null)} />
          <Bar dataKey="netMinor" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FunnelChart({ steps, label }: { steps: { name: string; value: number; note?: string }[]; label: string }) {
  return (
    <div style={{ height: 56 * steps.length + 8 }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={steps} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={10}>
          <XAxis type="number" hide domain={[0, Math.max(1, ...steps.map((s) => s.value))]} />
          <YAxis type="category" dataKey="name" tick={{ ...AXIS, fontSize: 13 }} tickLine={false} axisLine={false} width={84} />
          <Tooltip cursor={{ fill: "var(--surface-muted)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={String(payload[0].payload.name)} value={`${payload[0].value}${payload[0].payload.note ? ` · ${payload[0].payload.note}` : ""}`} /> : null)} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false} minPointSize={2}>
            {steps.map((s, i) => (
              <Cell key={s.name} fill="var(--primary)" fillOpacity={1 - i * 0.22} />
            ))}
            <LabelList dataKey="value" position="right" style={{ fontSize: 13, fontWeight: 600, fill: "var(--foreground)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
