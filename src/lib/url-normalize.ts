/**
 * Job URL normalisation for duplicate detection (SPEC F4):
 * strip tracking params, lowercase the host, drop fragments and trailing slashes.
 */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^ref$/i,
  /^refid$/i,
  /^trk/i,
  /^tracking/i,
  /^src$/i,
  /^source$/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^msclkid$/i,
  /^mc_[ce]id$/i,
  /^_hs/i,
  /^from$/i,
  /^originalsubdomain$/i,
  /^lipi$/i,
  /^alternatechannel$/i,
  /^eid$/i,
  /^position$/i,
  /^pagenum$/i,
  /^sid$/i,
  /^vjk$/i, // Indeed view key (job is identified by jk)
];

export function normalizeJobUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    try {
      url = new URL(`https://${raw.trim()}`);
    } catch {
      return raw.trim().toLowerCase();
    }
  }
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";
  url.port = "";
  const keep = [...url.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.some((re) => re.test(k)));
  keep.sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [k, v] of keep) url.searchParams.append(k, v);
  let out = url.toString();
  if (out.endsWith("/") && url.pathname !== "/") out = out.slice(0, -1);
  else if (url.pathname === "/" && !url.search) out = out.slice(0, -1);
  return out;
}

/** "https://careers.acme.com/jobs/1" → "acme.com" (best effort, for logos). */
export function domainFromUrl(raw: string): string | null {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    const generic = ["linkedin.com", "indeed.com", "glassdoor.com", "dice.com", "ziprecruiter.com", "greenhouse.io", "lever.co", "myworkdayjobs.com", "workday.com", "smartrecruiters.com", "joinhandshake.com", "ashbyhq.com"];
    const base = parts.slice(-2).join(".");
    if (generic.includes(base)) return null;
    return base;
  } catch {
    return null;
  }
}
