/** Pure, isomorphic JSON diff (audit viewer + tests). */
export type DiffRow = { path: string; before: unknown; after: unknown; kind: "added" | "removed" | "changed" };

/** Flat before/after diff of two JSON values (pure; used by the viewer and tests). */
export function jsonDiffPure(before: unknown, after: unknown, prefix = "", out: DiffRow[] = [], depth = 0): DiffRow[] {
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (depth < 6 && isObj(before) && isObj(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const k of keys) jsonDiffPure(before[k], after[k], prefix ? `${prefix}.${k}` : k, out, depth + 1);
    return out;
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return out;
  const path = prefix || "(value)";
  if (before === undefined || before === null) out.push({ path, before: null, after, kind: "added" });
  else if (after === undefined || after === null) out.push({ path, before, after: null, kind: "removed" });
  else out.push({ path, before, after, kind: "changed" });
  return out;
}
