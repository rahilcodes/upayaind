import { jsonDiffPure } from "./json-diff";
import { cn } from "@/lib/utils";

const show = (v: unknown) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 160 ? `${v.slice(0, 160)}…` : v;
  const s = JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
};

/** Compact before/after diff for audit entries (server-renderable). */
export function AuditDiff({ before, after, className }: { before: unknown; after: unknown; className?: string }) {
  if ((before === null || before === undefined) && (after === null || after === undefined)) return null;
  const rows = jsonDiffPure(before ?? {}, after ?? {});
  if (!rows.length) return null;
  return (
    <div tabIndex={0} role="region" aria-label="Changes" className={cn("mt-2 overflow-x-auto rounded-[10px] border border-border", className)}>
      <table className="w-full min-w-[420px] text-[12px]">
        <tbody>
          {rows.map((r) => (
            <tr key={r.path} className="border-t border-border first:border-t-0 align-top">
              <th scope="row" className="w-[28%] whitespace-nowrap bg-surface-muted px-3 py-1.5 text-left font-mono font-semibold">
                {r.path}
              </th>
              <td className={cn("w-[36%] break-all px-3 py-1.5 font-mono", r.kind !== "added" && "bg-[#FCEAE8]/60 text-[#7E1F18] dark:bg-transparent dark:text-[#ffb4ab]")}>
                <span className="sr-only">before: </span>
                {r.kind === "added" ? "" : show(r.before)}
              </td>
              <td className={cn("w-[36%] break-all px-3 py-1.5 font-mono", r.kind !== "removed" && "bg-[#E6F4EC]/70 text-[#145A39] dark:bg-transparent dark:text-[#8fe0b4]")}>
                <span className="sr-only">after: </span>
                {r.kind === "removed" ? "" : show(r.after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
