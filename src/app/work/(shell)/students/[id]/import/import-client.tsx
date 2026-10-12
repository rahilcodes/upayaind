"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { commitImportAction, previewImportAction } from "./actions";

type Row = { row: number; jobUrl: string; companyName: string; jobTitle: string; location: string | null; source: string; appliedAt: string; resumeVersionId: string | null; errors: string[]; warnings: string[] };
type Preview = { rows: Row[]; valid: number; invalid: number; missingColumns: string[] };

const TEMPLATE = "job_url,company,title,location,source,applied_at,resume_version_id\nhttps://www.linkedin.com/jobs/view/123456,Acme Corp,Data Analyst,\"Austin, TX\",LinkedIn,2026-10-12,\n";

export function ImportClient({ studentId, active, tz }: { studentId: string; active: boolean; tz: string }) {
  const t = useTranslations("workspace.import");
  const ts = useTranslations("jobSource");
  const router = useRouter();
  const [csv, setCsv] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [confirmWarnings, setConfirmWarnings] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [committing, startCommit] = React.useTransition();
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" });

  const load = async (f: File | null) => {
    if (!f) return;
    if (f.size > 2_000_000) return toast.error(t("tooBig"));
    const text = await f.text();
    setCsv(text);
    setFileName(f.name);
    setConfirmWarnings(false);
    start(async () => {
      const r = await previewImportAction(studentId, text);
      if (r.ok) setPreview(r.data as Preview);
      else {
        setPreview(null);
        toast.error(r.error);
      }
    });
  };

  const withWarnings = preview?.rows.filter((r) => !r.errors.length && r.warnings.length).length ?? 0;
  const importable = preview ? preview.rows.filter((r) => !r.errors.length && (confirmWarnings || !r.warnings.length)).length : 0;

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold">{t("stepUpload")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("columns")}</p>
            <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-[8px] bg-surface-muted px-3 py-2 text-[12.5px]">job_url, company, title, location, source, applied_at, resume_version_id</code>
          </div>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="upayaind-import-template.csv" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-primary hover:underline">
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("template")}
          </a>
        </div>
        <label
          htmlFor="csv-file"
          className={cn("mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted-foreground hover:border-primary hover:bg-accent/40", !active && "pointer-events-none opacity-50")}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void load(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          {fileName ? <FileSpreadsheet className="h-6 w-6 text-primary" aria-hidden="true" /> : <Upload className="h-6 w-6" aria-hidden="true" />}
          <span className={cn(fileName && "font-semibold text-foreground")}>{fileName ?? t("drop")}</span>
          <input id="csv-file" type="file" accept=".csv,text/csv" className="sr-only" disabled={!active} onChange={(e) => void load(e.target.files?.[0] ?? null)} />
        </label>
        {!active ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {t("inactive")}
          </p>
        ) : null}
      </Card>

      {pending ? <p className="text-sm text-muted-foreground" role="status">{t("checking")}</p> : null}

      {preview?.missingColumns.length ? (
        <p role="alert" className="rounded-[12px] bg-[#FCEAE8] px-4 py-3 text-sm font-medium text-[#A82A21]">
          {t("missingColumns", { cols: preview.missingColumns.join(", ") })}
        </p>
      ) : null}

      {preview && preview.rows.length ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-5">
            <h2 className="mr-auto text-[17px] font-bold">{t("stepReview")}</h2>
            <Badge tone="green">{t("validCount", { n: preview.valid - withWarnings })}</Badge>
            {withWarnings ? <Badge tone="amber">{t("warnCount", { n: withWarnings })}</Badge> : null}
            {preview.invalid ? <Badge tone="red">{t("errorCount", { n: preview.invalid })}</Badge> : null}
          </div>
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-[760px] text-left text-[14px]">
              <thead className="sticky top-0 bg-surface-muted text-[12.5px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">#</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("colJob")}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("colSource")}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("colApplied")}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("colResult")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.rows.map((r) => (
                  <tr key={r.row} className={cn(r.errors.length ? "bg-[#FCEAE8]/40" : r.warnings.length ? "bg-[#FDF3E1]/50" : "")}>
                    <td className="px-4 py-3 align-top tabular text-muted-foreground">{r.row}</td>
                    <td className="max-w-[320px] px-4 py-3 align-top">
                      <p className="font-semibold">{r.jobTitle || "—"}</p>
                      <p className="text-muted-foreground">{r.companyName || "—"}{r.location ? ` · ${r.location}` : ""}</p>
                      <p className="truncate text-[12.5px] text-muted-foreground">{r.jobUrl}</p>
                    </td>
                    <td className="px-4 py-3 align-top">{ts(r.source)}</td>
                    <td className="px-4 py-3 align-top tabular">{fmt.format(new Date(r.appliedAt))}</td>
                    <td className="px-4 py-3 align-top">
                      {r.errors.length ? (
                        <ul className="space-y-0.5 text-[13px] text-[#A82A21]">
                          {r.errors.map((e, i) => (
                            <li key={i} className="flex gap-1.5">
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {e}
                            </li>
                          ))}
                        </ul>
                      ) : r.warnings.length ? (
                        <ul className="space-y-0.5 text-[13px] text-[#7A4E0E]">
                          {r.warnings.map((e, i) => (
                            <li key={i} className="flex gap-1.5">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {e}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-success">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          {t("ready")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border p-5 sm:flex-row sm:items-center sm:justify-between">
            {withWarnings ? (
              <label htmlFor="confirm-warn" className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold">
                <Checkbox id="confirm-warn" checked={confirmWarnings} onChange={(e) => setConfirmWarnings(e.target.checked)} />
                {t("confirmWarnings", { n: withWarnings })}
              </label>
            ) : (
              <span className="text-sm text-muted-foreground">{t("errorsSkipped")}</span>
            )}
            <Button
              disabled={!importable || !active}
              loading={committing}
              onClick={() =>
                startCommit(async () => {
                  const r = await commitImportAction(studentId, csv, confirmWarnings);
                  if (r.ok) {
                    const d = r.data as { imported: number; skipped: number };
                    toast.success(t("done", { imported: d.imported, skipped: d.skipped }));
                    router.push(`/work/students/${studentId}/apply`);
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {t("importN", { n: importable })}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
