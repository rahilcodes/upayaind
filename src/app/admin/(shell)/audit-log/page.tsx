import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { AuditDiff } from "@/components/admin/audit-diff";
import { Pagination, withParams } from "@/components/portal/pagination";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { requireAction } from "@/server/auth/guards";
import { listAudit } from "@/server/services/admin-audit";
import { formatInTz } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

/** Where an audit entity can be opened in the admin. */
function entityHref(entity: string, id: string | null) {
  if (!id) return null;
  if (entity === "StudentProfile") return `/admin/students/${id}`;
  if (entity === "EmployeeProfile") return `/admin/employees/${id}`;
  return null;
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAction("audit.view");
  const sp = await searchParams;
  const t = await getTranslations("admin.audit");
  const tc = await getTranslations("admin.common");
  const data = await listAudit(sp);
  const f = data.filter;
  const current = { entity: f.entity, action: f.action, actor: f.actor, entityId: f.entityId, from: f.from, to: f.to };
  const filtered = Object.values(current).some(Boolean);

  return (
    <>
      <PageHeader title={t("title")} description={user.role === "ADMIN" ? t("description") : t("descriptionManager")} />

      <form method="get" className="mb-5 grid grid-cols-2 gap-3 rounded-[18px] border border-border bg-surface p-4 md:grid-cols-3 xl:grid-cols-[repeat(6,1fr)_auto] xl:items-end">
        <Field id="entity" label={t("entity")}>
          <Select id="entity" name="entity" defaultValue={f.entity ?? ""}>
            <option value="">{tc("any")}</option>
            {data.entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="action" label={t("action")}>
          <Input id="action" name="action" defaultValue={f.action} placeholder={t("actionHint")} title={t("actionHint")} />
        </Field>
        <Field id="actor" label={t("actor")}>
          <Select id="actor" name="actor" defaultValue={f.actor ?? ""}>
            <option value="">{tc("any")}</option>
            <option value="system">{tc("system")}</option>
            {data.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="entityId" label={t("entityId")}>
          <Input id="entityId" name="entityId" defaultValue={f.entityId} />
        </Field>
        <Field id="from" label={tc("from")}>
          <Input id="from" name="from" type="date" defaultValue={f.from} />
        </Field>
        <Field id="to" label={tc("to")}>
          <Input id="to" name="to" type="date" defaultValue={f.to} />
        </Field>
        <div className="col-span-2 flex gap-2 md:col-span-3 xl:col-span-1">
          <Button type="submit">{tc("apply")}</Button>
          {filtered ? (
            <Link href="/admin/audit-log" className={buttonVariants({ variant: "ghost" })}>
              {tc("clear")}
            </Link>
          ) : null}
        </div>
      </form>

      {data.items.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-6 w-6" aria-hidden="true" />} title={filtered ? t("emptyFiltered") : t("empty")} className="bg-surface" />
      ) : (
        <ol className="grid gap-3">
          {data.items.map((a) => {
            const href = entityHref(a.entity, a.entityId);
            const hasDiff = a.before !== null || a.after !== null;
            return (
              <li key={a.id} className="rounded-[16px] border border-border bg-surface px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <code className="rounded-[6px] bg-surface-muted px-1.5 py-0.5 text-[13px] font-semibold">{a.action}</code>
                      <Badge tone="grey">{a.entity}</Badge>
                      {a.entityId ? (
                        href ? (
                          <Link href={href} className="font-mono text-[12px] text-primary hover:underline">
                            {a.entityId}
                          </Link>
                        ) : (
                          <Link href={withParams("/admin/audit-log", {}, { entityId: a.entityId })} className="font-mono text-[12px] text-muted-foreground hover:underline">
                            {a.entityId}
                          </Link>
                        )
                      ) : null}
                    </p>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {a.actor ? t("by", { name: a.actor.name, role: a.actor.role }) : tc("system")}
                      {a.ip ? ` · ${a.ip}` : ""}
                    </p>
                  </div>
                  <time dateTime={a.at.toISOString()} className="tabular text-[13px] text-muted-foreground">
                    {formatInTz(a.at, user.timezone, "d MMM yyyy, h:mm:ss a")}
                  </time>
                </div>
                {hasDiff ? (
                  <details className="mt-2">
                    <summary className="inline-flex min-h-9 cursor-pointer items-center text-[13px] font-semibold text-primary">{t("showChanges")}</summary>
                    <AuditDiff before={a.before} after={a.after} />
                  </details>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <Pagination prevHref={f.cursor ? withParams("/admin/audit-log", current, {}) : null} nextHref={data.nextCursor ? withParams("/admin/audit-log", current, { cursor: data.nextCursor }) : null} />
    </>
  );
}
