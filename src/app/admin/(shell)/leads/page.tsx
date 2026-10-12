import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarClock, Inbox, Mail, Phone } from "lucide-react";
import { ExportButtons } from "@/components/admin/export-buttons";
import { Pagination, withParams } from "@/components/portal/pagination";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { requireAction } from "@/server/auth/guards";
import { LEAD_STATUSES, listLeads } from "@/server/services/leads-admin";
import { formatDate, formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LeadEditor } from "./lead-editor";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const TONE: Record<string, "blue" | "amber" | "violet" | "green" | "grey"> = { NEW: "blue", CONTACTED: "amber", QUALIFIED: "violet", CONVERTED: "green", LOST: "grey" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAction("leads.manage");
  const sp = await searchParams;
  const t = await getTranslations("admin.leads");
  const tc = await getTranslations("admin.common");
  const data = await listLeads(sp, user.id);
  const f = data.filter;
  const current = { q: f.q, status: f.status, owner: f.owner, source: f.source, market: f.market, due: f.due, from: f.from, to: f.to };
  const filtered = Object.values(current).some(Boolean);
  const ownerName = new Map(data.owners.map((o) => [o.id, o.name]));
  const now = Date.now();

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<ExportButtons href="/api/admin/leads/export" params={current} csvLabel={tc("exportCsv")} xlsxLabel={tc("exportXlsx")} />} />

      <nav aria-label={t("byStatus")} className="mb-4 flex flex-wrap gap-2">
        <Link href={withParams("/admin/leads", current, { status: null, cursor: null })} aria-current={!f.status ? "true" : undefined} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold", !f.status ? "border-primary bg-accent text-accent-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground")}>
          {tc("all")}
        </Link>
        {LEAD_STATUSES.map((s) => (
          <Link key={s} href={withParams("/admin/leads", current, { status: s, cursor: null })} aria-current={f.status === s ? "true" : undefined} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold", f.status === s ? "border-primary bg-accent text-accent-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground")}>
            {t(`statuses.${s}`)} <span className="tabular">{data.counts[s] ?? 0}</span>
          </Link>
        ))}
      </nav>

      <form method="get" className="mb-5 grid grid-cols-2 gap-3 rounded-[18px] border border-border bg-surface p-4 md:grid-cols-4 xl:grid-cols-[2fr_repeat(4,1fr)_auto] xl:items-end">
        {f.status ? <input type="hidden" name="status" value={f.status} /> : null}
        <Field id="q" label={tc("search")} className="col-span-2 md:col-span-4 xl:col-span-1">
          <Input id="q" name="q" type="search" defaultValue={f.q} placeholder={t("searchPlaceholder")} />
        </Field>
        <Field id="owner" label={t("owner")}>
          <Select id="owner" name="owner" defaultValue={f.owner ?? ""}>
            <option value="">{tc("any")}</option>
            <option value="me">{t("mine")}</option>
            <option value="none">{tc("unassigned")}</option>
            {data.owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="source" label={t("source")}>
          <Select id="source" name="source" defaultValue={f.source ?? ""}>
            <option value="">{tc("any")}</option>
            {data.sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="from" label={tc("from")}>
          <Input id="from" name="from" type="date" defaultValue={f.from} />
        </Field>
        <Field id="to" label={tc("to")}>
          <Input id="to" name="to" type="date" defaultValue={f.to} />
        </Field>
        <div className="col-span-2 flex flex-wrap items-center gap-3 md:col-span-4 xl:col-span-1">
          <Button type="submit">{tc("apply")}</Button>
          {filtered ? (
            <Link href="/admin/leads" className={buttonVariants({ variant: "ghost" })}>
              {tc("clear")}
            </Link>
          ) : null}
        </div>
        <label className="col-span-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium md:col-span-4 xl:col-span-6">
          <input type="checkbox" name="due" value="1" defaultChecked={f.due === "1"} className="h-[18px] w-[18px] accent-[var(--primary)]" />
          {t("due")}
        </label>
      </form>

      {data.items.length === 0 ? (
        <EmptyState icon={<Inbox className="h-6 w-6" aria-hidden="true" />} title={filtered ? t("emptyFiltered") : t("empty")} body={filtered ? undefined : t("emptyBody")} className="bg-surface" />
      ) : (
        <ul className="grid gap-4">
          {data.items.map((l) => {
            const overdue = l.nextFollowUpAt && l.nextFollowUpAt.getTime() < now && ["NEW", "CONTACTED", "QUALIFIED"].includes(l.status);
            const utm = l.utm && typeof l.utm === "object" ? Object.entries(l.utm as Record<string, string>) : [];
            return (
              <li key={l.id} className="rounded-[18px] border border-border bg-surface">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-start gap-x-4 gap-y-2 p-5 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-[220px] flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {l.name}
                        <Badge tone={TONE[l.status] ?? "grey"}>{t(`statuses.${l.status as "NEW"}`)}</Badge>
                        {overdue ? <Badge tone="red">{t("overdue")}</Badge> : null}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{l.message ?? t("noMessage")}</p>
                    </div>
                    <div className="grid gap-1 text-[13px] text-muted-foreground sm:text-right">
                      <span className="tabular">{formatInTz(l.createdAt, user.timezone, "d MMM, h:mm a")}</span>
                      <span>
                        {l.source}
                        {l.marketCode ? ` · ${l.marketCode}` : ""}
                      </span>
                      <span>{l.ownerId ? t("ownedBy", { name: ownerName.get(l.ownerId) ?? "—" }) : tc("unassigned")}</span>
                    </div>
                    <span className="sr-only">{t("expand")}</span>
                  </summary>
                  <div className="grid gap-5 border-t border-border p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                    <div className="grid content-start gap-3 text-sm">
                      <a href={`mailto:${l.email}`} className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary hover:underline">
                        <Mail className="h-4 w-4" aria-hidden="true" />
                        {l.email}
                      </a>
                      {l.phone ? (
                        <a href={`tel:${l.phone}`} className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary hover:underline">
                          <Phone className="h-4 w-4" aria-hidden="true" />
                          {l.phone}
                        </a>
                      ) : null}
                      {l.nextFollowUpAt ? (
                        <p className={cn("inline-flex items-center gap-2", overdue && "font-semibold text-danger")}>
                          <CalendarClock className="h-4 w-4" aria-hidden="true" />
                          {t("followUpOn", { date: formatDate(l.nextFollowUpAt, user.timezone) })}
                        </p>
                      ) : null}
                      {l.message ? <p className="whitespace-pre-line rounded-[12px] bg-surface-muted p-3">{l.message}</p> : null}
                      {utm.length ? (
                        <div>
                          <p className="mb-1 text-[13px] font-semibold text-muted-foreground">{t("utm")}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {utm.map(([k, v]) => (
                              <Badge key={k} tone="grey">
                                {k}: {v}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {l.notes.length ? (
                        <div>
                          <p className="mb-1 text-[13px] font-semibold text-muted-foreground">{t("notes")}</p>
                          <ul className="grid gap-2">
                            {l.notes.map((n, i) => (
                              <li key={i} className="rounded-[10px] border border-border p-2.5">
                                <p className="whitespace-pre-line">{n.text}</p>
                                <p className="tabular mt-1 text-[12px] text-muted-foreground">
                                  {n.by ?? tc("system")} · {formatInTz(n.at, user.timezone, "d MMM, h:mm a")}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    <LeadEditor lead={{ id: l.id, status: l.status, ownerId: l.ownerId, nextFollowUpAt: l.nextFollowUpAt ? l.nextFollowUpAt.toISOString().slice(0, 10) : null }} owners={data.owners} meId={user.id} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination prevHref={f.cursor ? withParams("/admin/leads", current, {}) : null} nextHref={data.nextCursor ? withParams("/admin/leads", current, { cursor: data.nextCursor }) : null} />
    </>
  );
}
