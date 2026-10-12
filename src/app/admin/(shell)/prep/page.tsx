import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ExternalLink, FileText, GraduationCap } from "lucide-react";
import { Section } from "@/components/admin/bits";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAction } from "@/server/auth/guards";
import { db } from "@/server/db";
import { listPrep, listSlots } from "@/server/services/admin-prep";
import { formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DeletePrepButton, DeleteSlotButton, OutcomeDialog, PrepDialog, PublishToggle, SlotDialog, type PrepValue } from "./prep-client";

export const metadata: Metadata = { title: "Interview prep" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "blue" | "green" | "red" | "grey" | "amber"> = { OPEN: "grey", SCHEDULED: "blue", DONE: "green", NO_SHOW: "red", CANCELLED: "amber" };

export default async function PrepAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAction("prep.manage");
  const sp = await searchParams;
  const tab = sp.tab === "mocks" ? "mocks" : "library";
  const t = await getTranslations("admin.prep");
  const ts = await getTranslations("admin.student360.mockStatus");
  const markets = await db.market.findMany({ orderBy: { name: "asc" }, select: { code: true, name: true } });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <nav aria-label={t("sections")} className="mb-5">
        <ul className="inline-flex gap-1 rounded-[14px] bg-surface-muted p-1">
          {(["library", "mocks"] as const).map((k) => (
            <li key={k}>
              <Link href={k === "library" ? "/admin/prep" : "/admin/prep?tab=mocks"} aria-current={tab === k ? "page" : undefined} className={cn("inline-flex min-h-10 items-center rounded-[10px] px-4 text-sm font-semibold", tab === k ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {t(`tabs.${k}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "library" ? <Library markets={markets} /> : <Mocks tz={user.timezone} ts={ts} />}
    </>
  );
}

async function Library({ markets }: { markets: { code: string; name: string }[] }) {
  const t = await getTranslations("admin.prep");
  const items = await listPrep();
  return (
    <>
      <div className="mb-4 flex justify-end">
        <PrepDialog markets={markets} />
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<GraduationCap className="h-6 w-6" aria-hidden="true" />} title={t("empty")} body={t("emptyBody")} className="bg-surface" />
      ) : (
        <ul className="grid gap-3">
          {items.map((r) => {
            const value: PrepValue = { id: r.id, title: r.title, type: r.type as PrepValue["type"], tags: r.tags, marketCodes: r.marketCodes, url: r.url, fileKey: r.fileKey, fileName: r.file?.filename ?? null, body: r.body, isPublished: r.isPublished };
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[16px] border border-border bg-surface px-5 py-4">
                <div className="min-w-[220px] flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {r.title}
                    <Badge tone="blue">{t(`types.${r.type as "VIDEO"}`)}</Badge>
                    {!r.isPublished ? <Badge tone="amber">{t("draft")}</Badge> : null}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5 text-[12px] text-muted-foreground">
                    {r.tags.map((x) => (
                      <span key={x} className="rounded-full bg-surface-muted px-2 py-0.5">
                        #{x}
                      </span>
                    ))}
                    <span>{r.marketCodes.length ? r.marketCodes.join(", ") : t("allMarkets")}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      {t("open")}
                    </a>
                  ) : null}
                  {r.file ? (
                    <a href={`/api/files/${r.file.id}?inline=1`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      PDF
                    </a>
                  ) : null}
                  <PublishToggle id={r.id} isPublished={r.isPublished} title={r.title} />
                  <PrepDialog value={value} markets={markets} />
                  <DeletePrepButton id={r.id} title={r.title} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

async function Mocks({ tz, ts }: { tz: string; ts: (k: "OPEN") => string }) {
  const t = await getTranslations("admin.prep");
  const { slots, staff } = await listSlots();
  const now = Date.now();
  const upcoming = slots.filter((s) => s.scheduledAt.getTime() >= now - 2 * 3600e3 && ["OPEN", "SCHEDULED"].includes(s.status));
  const toRecord = slots.filter((s) => s.scheduledAt.getTime() < now - 2 * 3600e3 && s.status === "SCHEDULED");
  const past = slots.filter((s) => !upcoming.includes(s) && !toRecord.includes(s)).reverse();

  const table = (rows: typeof slots, empty: string) =>
    rows.length ? (
      <TableWrap className="border-0">
        <Table className="min-w-[760px]">
          <THead>
            <tr>
              <TH>{t("when")}</TH>
              <TH>{t("focus")}</TH>
              <TH>{t("conductedBy")}</TH>
              <TH>{t("student")}</TH>
              <TH>{t("status")}</TH>
              <TH className="text-right">{t("actions")}</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((s) => {
              const sc = s.scores as Record<string, number> | null;
              return (
                <TR key={s.id}>
                  <TD className="tabular whitespace-nowrap text-[13px]">
                    {formatInTz(s.scheduledAt, tz, "EEE d MMM, h:mm a")}
                    <span className="block text-muted-foreground">{t("minutes", { n: s.durationMin })}</span>
                  </TD>
                  <TD className="font-medium">
                    {s.focus ?? "—"}
                    {sc ? <span className="tabular block text-[12px] font-normal text-muted-foreground">{t("scoreLine", { c: sc.communication ?? "—", t: sc.technical ?? "—", s: sc.structure ?? "—", f: sc.confidence ?? "—" })}</span> : null}
                  </TD>
                  <TD className="text-[13px]">{s.conductedBy}</TD>
                  <TD className="text-[13px]">
                    {s.student ? (
                      <Link href={`/admin/students/${s.student.id}`} className="font-semibold hover:underline">
                        {s.student.user.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{t("notBooked")}</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[s.status] ?? "grey"}>{ts(s.status as "OPEN")}</Badge>
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      {["OPEN", "SCHEDULED"].includes(s.status) ? <OutcomeDialog id={s.id} studentName={s.student?.user.name ?? null} focus={s.focus} booked={Boolean(s.student)} /> : null}
                      {!s.student ? <DeleteSlotButton id={s.id} label={t("deleteSlot", { when: formatInTz(s.scheduledAt, tz, "d MMM, h:mm a") })} /> : null}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    ) : (
      <p className="text-sm text-muted-foreground">{empty}</p>
    );

  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <SlotDialog staff={staff} timezone={tz} />
      </div>
      {toRecord.length ? (
        <Section id="to-record" title={t("toRecordTitle", { count: toRecord.length })} description={t("toRecordDescription")} className="border-[#F2D9A6]">
          {table(toRecord, "")}
        </Section>
      ) : null}
      <Section id="upcoming" title={t("upcomingTitle")}>
        {table(upcoming, t("upcomingEmpty"))}
      </Section>
      <Section id="past" title={t("pastTitle")} description={t("pastDescription")}>
        {table(past, t("pastEmpty"))}
      </Section>
    </div>
  );
}
