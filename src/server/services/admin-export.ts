import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { fromMinor } from "@/lib/format";
import type { Column, Row } from "./reports";

/**
 * CSV / XLSX writers shared by every admin export. Money cells are written in
 * major units of the row's own `currency` column (never converted or summed).
 * CSV cells starting with = + - @ are prefixed with ' (formula injection).
 */

export type Sheet = { title: string; columns: (Column & { label: string })[]; rows: Row[] };

function cell(col: Column, row: Row) {
  const v = row[col.key];
  if (v === null || v === undefined) return null;
  if (col.type === "money" && typeof v === "number") return fromMinor(v, String(row.currency ?? "USD"));
  return v;
}

export function safeCsvCell(v: unknown): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function toCsv(sheet: Sheet): string {
  const header = sheet.columns.map((c) => c.label);
  const data = sheet.rows.map((r) => sheet.columns.map((c) => safeCsvCell(cell(c, r))));
  return "﻿" + Papa.unparse({ fields: header, data });
}

export async function toXlsx(sheet: Sheet): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UpayaInd";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheet.title.slice(0, 31) || "Report", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = sheet.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.max(12, Math.min(40, c.label.length + 4)),
    style: { numFmt: c.type === "pct" ? '0.0"%"' : c.type === "money" ? "#,##0.00" : c.type === "decimal" || c.type === "minutes" ? "0.0" : undefined },
  }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1846" } };
  for (const r of sheet.rows) {
    const values: Record<string, unknown> = {};
    for (const c of sheet.columns) values[c.key] = cell(c, r);
    ws.addRow(values);
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function fileResponse(body: string | Buffer, filename: string, format: "csv" | "xlsx") {
  const type = format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
