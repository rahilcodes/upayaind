#!/usr/bin/env node
/**
 * Deep-merge a JSON fragment into a messages file without touching existing
 * keys (safe when several people edit the same file).
 *
 *   node scripts/i18n-merge.mjs src/i18n/messages/en/student.json '{"student":{"settings":{"x":"y"}}}'
 *   node scripts/i18n-merge.mjs src/i18n/messages/en/student.json ./fragment.json
 *
 * Existing values are kept unless --overwrite is passed. Prints the keys added.
 */
import fs from "node:fs";

const [, , file, fragmentArg, ...flags] = process.argv;
if (!file || !fragmentArg) {
  console.error("usage: i18n-merge.mjs <messages.json> <fragment.json | inline JSON> [--overwrite]");
  process.exit(2);
}
const overwrite = flags.includes("--overwrite");
const fragment = JSON.parse(fs.existsSync(fragmentArg) ? fs.readFileSync(fragmentArg, "utf8") : fragmentArg);
const target = JSON.parse(fs.readFileSync(file, "utf8"));

const added = [];
const kept = [];
function merge(dst, src, path) {
  for (const [k, v] of Object.entries(src)) {
    const p = path ? `${path}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (dst[k] === undefined) dst[k] = {};
      else if (typeof dst[k] !== "object") throw new Error(`${p}: existing value is not an object`);
      merge(dst[k], v, p);
    } else if (dst[k] === undefined || overwrite) {
      if (dst[k] !== undefined && dst[k] !== v) kept.push(`${p} (overwritten)`);
      else if (dst[k] === undefined) added.push(p);
      dst[k] = v;
    } else if (dst[k] !== v) {
      kept.push(p);
    }
  }
}
merge(target, fragment, "");
fs.writeFileSync(file, `${JSON.stringify(target, null, 2)}\n`);
console.log(`${file}: added ${added.length} key(s)${added.length ? `\n  ${added.join("\n  ")}` : ""}`);
if (kept.length) console.log(`kept existing (${kept.length}):\n  ${kept.join("\n  ")}`);
