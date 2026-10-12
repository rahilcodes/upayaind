"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusPill } from "@/components/portal/status-pill";
import { CompanyLogo } from "@/components/portal/company-logo";
import { StatusSelect } from "@/components/work/status-select";
import { cn } from "@/lib/utils";
import { quickStatusAction } from "../actions";
import { bulkStatusAction } from "./actions";

export type AppRow = {
  id: string;
  companyName: string;
  companyDomain: string | null;
  jobTitle: string;
  status: ApplicationStatus;
  source: string;
  sourceLabel: string;
  when: string;
  jobUrl: string;
  studentId: string;
  studentName: string;
  canUpdate: boolean;
  allowed: ApplicationStatus[];
};

const BULK_TARGETS: ApplicationStatus[] = ["VIEWED", "RECRUITER_REPLIED", "ASSESSMENT", "REJECTED", "NO_RESPONSE", "WITHDRAWN", "ON_HOLD"];

export function ApplicationsTable({ rows, highlight }: { rows: AppRow[]; highlight?: string }) {
  const t = useTranslations("work.applications");
  const ts = useTranslations("status");
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [to, setTo] = React.useState<string>("");
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();
  const selectable = rows.filter((r) => r.canUpdate);
  const all = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  React.useEffect(() => {
    if (!highlight) return;
    document.getElementById(`app-${highlight}`)?.scrollIntoView({ block: "center" });
  }, [highlight]);

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const apply = () => {
    if (!to || !selected.size) return;
    start(async () => {
      const r = await bulkStatusAction([...selected], to, note || null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data.ok) toast.success(t("bulk.done", { count: r.data.ok, status: ts(to as ApplicationStatus) }));
      if (r.data.failed.length) toast.error(t("bulk.someFailed", { count: r.data.failed.length, reason: r.data.failed[0]!.error }));
      setSelected(new Set());
      setNote("");
      router.refresh();
    });
  };

  return (
    <>
      {selected.size ? (
        <div role="region" aria-label={t("bulk.aria")} className="sticky top-[68px] z-20 mb-3 flex flex-wrap items-end gap-3 rounded-[14px] border border-primary/30 bg-accent p-3">
          <p className="self-center text-sm font-semibold text-accent-foreground">{t("bulk.selected", { count: selected.size })}</p>
          <div className="min-w-[180px]">
            <label htmlFor="bulk-to" className="sr-only">{t("bulk.to")}</label>
            <Select id="bulk-to" value={to} onChange={(e) => setTo(e.target.value)} className="h-10">
              <option value="">{t("bulk.to")}</option>
              {BULK_TARGETS.map((s) => <option key={s} value={s}>{ts(s)}</option>)}
            </Select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label htmlFor="bulk-note" className="sr-only">{t("bulk.note")}</label>
            <Input id="bulk-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("bulk.note")} className="h-10" maxLength={2000} />
          </div>
          <Button onClick={apply} loading={pending} disabled={!to}>{t("bulk.apply")}</Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>{t("bulk.clear")}</Button>
        </div>
      ) : null}
      <TableWrap>
        <Table className="min-w-[980px]">
          <caption className="sr-only">{t("caption")}</caption>
          <THead>
            <tr>
              <TH className="w-10">
                <Checkbox aria-label={t("selectAll")} checked={all} onChange={() => setSelected(all ? new Set() : new Set(selectable.map((r) => r.id)))} disabled={!selectable.length} />
              </TH>
              <TH>{t("col.job")}</TH>
              <TH>{t("col.student")}</TH>
              <TH>{t("col.source")}</TH>
              <TH>{t("col.applied")}</TH>
              <TH>{t("col.status")}</TH>
              <TH><span className="sr-only">{t("col.change")}</span></TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.id} id={`app-${r.id}`} className={cn(highlight === r.id && "bg-[#FFF8E6] dark:bg-warning/10", selected.has(r.id) && "bg-accent/60")}>
                <TD>
                  <Checkbox aria-label={t("select", { title: r.jobTitle, company: r.companyName })} checked={selected.has(r.id)} onChange={() => toggle(r.id)} disabled={!r.canUpdate} />
                </TD>
                <TD>
                  <div className="flex items-center gap-3">
                    <CompanyLogo name={r.companyName} domain={r.companyDomain} size={32} />
                    <div className="min-w-0">
                      <a href={r.jobUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-[320px] items-center gap-1 font-semibold text-foreground hover:underline">
                        <span className="truncate">{r.jobTitle}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="sr-only">{t("opensNew")}</span>
                      </a>
                      <p className="truncate text-xs text-muted-foreground">{r.companyName}</p>
                    </div>
                  </div>
                </TD>
                <TD><Link href={`/work/students/${r.studentId}`} className="font-medium text-foreground hover:underline">{r.studentName}</Link></TD>
                <TD className="text-muted-foreground">{r.sourceLabel}</TD>
                <TD className="whitespace-nowrap tabular">{r.when}</TD>
                <TD><StatusPill status={r.status} /></TD>
                <TD className="text-right">
                  {r.canUpdate ? <StatusSelect applicationId={r.id} status={r.status} allowed={r.allowed} action={quickStatusAction} label={t("change", { title: r.jobTitle, company: r.companyName })} /> : <span className="text-xs text-muted-foreground">{t("readOnly")}</span>}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
