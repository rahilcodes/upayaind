// Writes brand-coloured SVG icons from simple-icons into public/brand/companies/<slug>.svg.
// Re-run after changing the list: `node scripts/gen-company-logos.mjs` (D-148).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as si from "simple-icons";

const SLUGS = ["google", "accenture", "wipro", "hcl", "meta", "cisco", "intel", "nvidia", "dell", "hp", "sap", "goldmansachs", "zoho", "paytm", "phonepe", "barclays", "hsbc", "vodafone", "atlassian", "stripe"];
const out = join(process.cwd(), "public", "brand", "companies");
mkdirSync(out, { recursive: true });
for (const slug of SLUGS) {
  const key = `si${slug[0].toUpperCase()}${slug.slice(1)}`;
  const icon = si[key];
  if (!icon) throw new Error(`simple-icons has no ${key}`);
  const hex = icon.hex.toUpperCase() === "FFFFFF" ? "0B1846" : icon.hex;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="${icon.title}"><title>${icon.title}</title><path fill="#${hex}" d="${icon.path}"/></svg>\n`;
  writeFileSync(join(out, `${slug}.svg`), svg);
  console.log(`${slug}.svg  ${icon.title}  #${hex}`);
}
