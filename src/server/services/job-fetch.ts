import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import type { EmploymentType, Role, WorkMode } from "@/generated/prisma/enums";
import { UserError } from "@/server/errors";
import { enforceRateLimit } from "./ratelimit";

/**
 * Job URL → auto-fill (F4 employee speed). Fetches the posting server-side
 * (SSRF-safe: http(s) only, public addresses only, ≤ 3 redirects, 8 s, 2 MB),
 * then extracts title / company / location / description:
 *  1. JSON-LD `JobPosting` when the page has one (LinkedIn, Indeed, Greenhouse,
 *     Lever, Workday publish it), else
 *  2. a readability-style text extraction (strip chrome, prefer <main>/<article>
 *     or the largest text block, decode entities, collapse whitespace).
 * Many boards block bots: callers show a friendly message and keep manual paste.
 */

export const FETCH_TIMEOUT_MS = 8_000;
export const FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const FETCH_MAX_REDIRECTS = 3;
const DESCRIPTION_MAX = 20_000;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export class JobFetchError extends UserError {
  constructor(
    message: string,
    public code: "invalid_url" | "blocked_address" | "timeout" | "too_large" | "http_error" | "not_html" | "empty" | "network",
  ) {
    super(message, "jobUrl");
    this.name = "UserError";
  }
}

export type JobFetchResult = {
  url: string;
  title: string | null;
  company: string | null;
  location: string | null;
  description: string;
  workMode: WorkMode | null;
  employmentType: EmploymentType | null;
  /** How the fields were found. */
  method: "jsonld" | "text";
};

// ─────────────────────────── SSRF guard ───────────────────────────

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((n, o) => n * 256 + Number(o), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3], // multicast + reserved + broadcast
];

/** True for loopback, private, link-local, CGNAT, multicast, unspecified and IPv4-mapped equivalents. */
export function isBlockedAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (ipv4ToInt(base) >>> (32 - bits)));
  }
  if (v === 6) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
    const mapped = /^(?:0*:)*ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isBlockedAddress(mapped[1]!);
    if (lower === "::" || lower === "::1" || lower === "0:0:0:0:0:0:0:0" || lower === "0:0:0:0:0:0:0:1") return true;
    if (/^f[cd]/.test(lower)) return true; // fc00::/7 unique local
    if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
    if (/^ff/.test(lower)) return true; // multicast
    if (/^64:ff9b:/.test(lower)) return true; // NAT64 (could map to private v4)
    if (/^2001:db8:/.test(lower)) return true; // documentation
    return false;
  }
  return true; // not an IP at all
}

export type Resolver = (hostname: string) => Promise<string[]>;

const defaultResolver: Resolver = async (hostname) => (await dns.lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

/** Parses and checks one URL: http(s) only, default ports, public hostname. Returns the resolved addresses. */
export async function assertSafeUrl(raw: string, resolve: Resolver = defaultResolver): Promise<{ url: URL; addresses: string[] }> {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new JobFetchError("Enter a valid job URL.", "invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new JobFetchError("Only http(s) links can be fetched.", "invalid_url");
  if (url.username || url.password) throw new JobFetchError("Links with credentials can't be fetched.", "invalid_url");
  if (url.port && url.port !== "80" && url.port !== "443") throw new JobFetchError("Links on non-standard ports can't be fetched.", "blocked_address");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isIp = net.isIP(host) !== 0;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa") || (!isIp && !host.includes("."))) {
    throw new JobFetchError("That address can't be fetched.", "blocked_address");
  }
  let addresses: string[];
  if (isIp) addresses = [host];
  else {
    try {
      addresses = await resolve(host);
    } catch {
      throw new JobFetchError("We couldn't reach that site. Check the link or paste the details manually.", "network");
    }
  }
  if (!addresses.length || addresses.some(isBlockedAddress)) throw new JobFetchError("That address can't be fetched.", "blocked_address");
  return { url, addresses };
}

// ─────────────────────────── Fetch ───────────────────────────

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Fetch an HTML page with the SSRF, redirect, time and size limits. Every redirect hop is re-checked. */
export async function fetchHtml(raw: string, deps: { fetchImpl?: FetchLike; resolve?: Resolver; now?: () => number } = {}): Promise<{ html: string; finalUrl: string }> {
  const fetchImpl = deps.fetchImpl ?? ((u, init) => fetch(u, init));
  const deadline = (deps.now?.() ?? Date.now()) + FETCH_TIMEOUT_MS;
  let current = raw;
  for (let hop = 0; hop <= FETCH_MAX_REDIRECTS; hop++) {
    const { url } = await assertSafeUrl(current, deps.resolve);
    const remaining = deadline - (deps.now?.() ?? Date.now());
    if (remaining <= 0) throw new JobFetchError("The page took too long to load.", "timeout");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "en-US,en;q=0.8" },
      });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).name === "AbortError" || (e as Error).name === "TimeoutError") throw new JobFetchError("The page took too long to load.", "timeout");
      throw new JobFetchError("We couldn't reach that site. Check the link or paste the details manually.", "network");
    }
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (!loc) throw new JobFetchError("The page redirected somewhere we couldn't follow.", "http_error");
      current = new URL(loc, url).toString();
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      await res.body?.cancel().catch(() => undefined);
      throw new JobFetchError(res.status === 403 || res.status === 429 || res.status === 503 ? "This job board blocks automatic fetching. Paste the details manually." : `The page returned an error (HTTP ${res.status}).`, "http_error");
    }
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (type && !/text\/html|application\/xhtml\+xml|text\/plain/.test(type)) {
      clearTimeout(timer);
      await res.body?.cancel().catch(() => undefined);
      throw new JobFetchError("That link isn't a web page.", "not_html");
    }
    const length = Number(res.headers.get("content-length"));
    if (Number.isFinite(length) && length > FETCH_MAX_BYTES) {
      clearTimeout(timer);
      await res.body?.cancel().catch(() => undefined);
      throw new JobFetchError("The page is too large to fetch.", "too_large");
    }
    try {
      const html = await readLimited(res, FETCH_MAX_BYTES);
      return { html, finalUrl: url.toString() };
    } catch (e) {
      if (e instanceof JobFetchError) throw e;
      if ((e as Error).name === "AbortError") throw new JobFetchError("The page took too long to load.", "timeout");
      throw new JobFetchError("We couldn't read that page.", "network");
    } finally {
      clearTimeout(timer);
    }
  }
  throw new JobFetchError("Too many redirects.", "http_error");
}

async function readLimited(res: Response, max: number): Promise<string> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new JobFetchError("The page is too large to fetch.", "too_large");
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

// ─────────────────────────── HTML → text ───────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", sbquo: "‚", bdquo: "„",
  bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", deg: "°", times: "×", divide: "÷", laquo: "«", raquo: "»",
  euro: "€", pound: "£", yen: "¥", cent: "¢", sect: "§", para: "¶", plusmn: "±", frac12: "½", frac14: "¼", frac34: "¾",
  eacute: "é", egrave: "è", ecirc: "ê", aacute: "á", agrave: "à", acirc: "â", auml: "ä", ouml: "ö", uuml: "ü", oslash: "ø",
  ccedil: "ç", ntilde: "ñ", iacute: "í", oacute: "ó", uacute: "ú", szlig: "ß", aring: "å", aelig: "æ", icirc: "î", ocirc: "ô", ucirc: "û",
  Eacute: "É", Agrave: "À", Ouml: "Ö", Uuml: "Ü", Auml: "Ä",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "";
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

const DROP_TAGS = ["script", "style", "noscript", "template", "svg", "iframe", "canvas", "video", "audio", "object", "head", "nav", "header", "footer", "aside", "form", "button", "select", "dialog"];
const BLOCK_TAGS = "p|div|section|article|main|ul|ol|li|h[1-6]|br|tr|td|th|table|thead|tbody|blockquote|pre|hr|dd|dt|dl|figure|figcaption|address|summary|details|fieldset";

function dropTags(html: string, tags = DROP_TAGS) {
  let out = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const t of tags) out = out.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}\\s*>`, "gi"), " ");
  return out;
}

/** HTML fragment → readable plain text (block tags → newlines, list items → bullets, entities decoded, whitespace collapsed). */
export function htmlToText(html: string): string {
  let s = dropTags(html);
  s = s.replace(/<\/li\s*>/gi, "");
  s = s.replace(/<li\b[^>]*>/gi, "\n• ");
  s = s.replace(/<\/?(?:br)\b[^>]*>/gi, "\n");
  s = s.replace(new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/\u00a0/g, " ").replace(/[ \t\f\v]+/g, " ");
  s = s
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
}

function textBetween(html: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]!);
  return out;
}

function meta(html: string, key: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  if (!tag) return null;
  const c = /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return c ? decodeEntities(c).trim() || null : null;
}

/** Largest readable block: <main> / <article> / role=main, else known description containers, else <body>. */
function mainContent(html: string): string {
  const candidates = [
    ...textBetween(html, "main"),
    ...textBetween(html, "article"),
    ...[...html.matchAll(/<(div|section)\b[^>]*(?:id|class)=["'][^"']*(?:job-?desc|jobdescription|description|posting|job-details|jobDetails|job_description)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]!),
  ];
  const scored = candidates.map((c) => ({ c, len: htmlToText(c).length })).sort((a, b) => b.len - a.len);
  if (scored[0] && scored[0].len >= 200) return scored[0].c;
  const body = textBetween(html, "body")[0];
  return body ?? html;
}

// ─────────────────────────── JSON-LD JobPosting ───────────────────────────

type JsonLd = Record<string, unknown>;

function findJobPosting(node: unknown, depth = 0): JsonLd | null {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findJobPosting(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const o = node as JsonLd;
  const type = o["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === "string" && t.toLowerCase() === "jobposting")) return o;
  for (const k of ["@graph", "mainEntity", "itemListElement", "item"]) {
    const r = findJobPosting(o[k], depth + 1);
    if (r) return r;
  }
  return null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? decodeEntities(v).trim() : null);

function jsonLdLocation(job: JsonLd): string | null {
  const locs = Array.isArray(job.jobLocation) ? job.jobLocation : job.jobLocation ? [job.jobLocation] : [];
  const parts: string[] = [];
  for (const l of locs.slice(0, 3)) {
    if (!l || typeof l !== "object") continue;
    const o = l as JsonLd;
    const addr = (o.address && typeof o.address === "object" ? (o.address as JsonLd) : o) as JsonLd;
    const p = [str(addr.addressLocality), str(addr.addressRegion), str(addr.addressCountry && typeof addr.addressCountry === "object" ? (addr.addressCountry as JsonLd).name : addr.addressCountry)].filter(Boolean) as string[];
    const label = p.length ? p.join(", ") : str(o.name) ?? str(addr.name);
    if (label && !parts.includes(label)) parts.push(label);
  }
  if (!parts.length) {
    const req = job.applicantLocationRequirements;
    const r = Array.isArray(req) ? req[0] : req;
    const name = r && typeof r === "object" ? str((r as JsonLd).name) : null;
    if (name) parts.push(name);
  }
  return parts.length ? parts.join(" · ").slice(0, 200) : null;
}

const EMPLOYMENT_MAP: Record<string, EmploymentType> = {
  FULL_TIME: "FULL_TIME",
  FULLTIME: "FULL_TIME",
  PART_TIME: "PART_TIME",
  PARTTIME: "PART_TIME",
  CONTRACTOR: "CONTRACT",
  CONTRACT: "CONTRACT",
  TEMPORARY: "TEMPORARY",
  TEMP: "TEMPORARY",
  INTERN: "INTERNSHIP",
  INTERNSHIP: "INTERNSHIP",
};

function jsonLdEmployment(v: unknown): EmploymentType | null {
  const list = Array.isArray(v) ? v : [v];
  for (const x of list) {
    if (typeof x !== "string") continue;
    const k = x.toUpperCase().replace(/[\s-]/g, "_");
    if (EMPLOYMENT_MAP[k]) return EMPLOYMENT_MAP[k];
  }
  return null;
}

/** Work mode from wording (title, location and description). Hybrid wins over remote; remote over on-site. */
export function detectWorkMode(text: string): WorkMode | null {
  const t = text.toLowerCase();
  if (/\bhybrid\b/.test(t)) return "HYBRID";
  if (/\b(remote|work from home|wfh|telecommute)\b/.test(t) && !/\b(not|no) remote\b|remote work is not/.test(t)) return "REMOTE";
  if (/\b(on-?site|in-?office|in person)\b/.test(t)) return "ONSITE";
  return null;
}

/** Work mode from wording in the title/location first (most reliable), then the description's opening. */
function workModeFor(title: string | null, location: string | null, description: string, jsonLdType?: unknown): WorkMode | null {
  if (typeof jsonLdType === "string" && jsonLdType.toUpperCase() === "TELECOMMUTE") return "REMOTE";
  return detectWorkMode(`${title ?? ""} ${location ?? ""}`) ?? detectWorkMode(description.slice(0, 1500));
}

function cleanTitle(raw: string | null, opts: { stripSite?: boolean } = {}): string | null {
  if (!raw) return null;
  // Page titles carry the site: "Senior Analyst - Acme | LinkedIn" → "Senior Analyst".
  const first = opts.stripSite ? (raw.split(/\s+[|–—]\s+|\s+-\s+(?=[A-Z])/)[0]?.trim() ?? raw) : raw;
  return first.replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

/** Pure extractor (unit-tested with fixture HTML). */
export function extractJobFromHtml(html: string, url: string): JobFetchResult {
  const blocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
  for (const raw of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim().replace(/^<!--|-->$/g, ""));
    } catch {
      continue;
    }
    const job = findJobPosting(parsed);
    if (!job) continue;
    const org = job.hiringOrganization && typeof job.hiringOrganization === "object" ? (job.hiringOrganization as JsonLd) : null;
    const descriptionRaw = str(job.description) ?? "";
    const description = (/<[a-z][\s\S]*>/i.test(descriptionRaw) ? htmlToText(descriptionRaw) : htmlToText(descriptionRaw.replace(/\n/g, "<br>"))).slice(0, DESCRIPTION_MAX);
    const title = cleanTitle(str(job.title) ?? str(job.name));
    const company = (str(org?.name) ?? (typeof job.hiringOrganization === "string" ? str(job.hiringOrganization) : null))?.slice(0, 200) ?? null;
    const location = jsonLdLocation(job);
    if (description.length >= 50 || title) {
      return { url, title, company, location, description, workMode: workModeFor(title, location, description, job.jobLocationType), employmentType: jsonLdEmployment(job.employmentType), method: "jsonld" };
    }
  }

  // Plain HTML fallback.
  const content = mainContent(html);
  const description = htmlToText(content).slice(0, DESCRIPTION_MAX);
  const h1 = textBetween(dropTags(html, ["script", "style", "noscript", "svg"]), "h1").map((h) => htmlToText(h)).find((h) => h.length > 2 && h.length <= 200) ?? null;
  const title = h1 ? cleanTitle(h1) : cleanTitle(meta(html, "og:title") ?? (textBetween(html, "title")[0] ? htmlToText(textBetween(html, "title")[0]!) : null), { stripSite: true });
  const company = meta(html, "og:site_name")?.slice(0, 200) ?? null;
  return { url, title, company, location: null, description, workMode: workModeFor(title, null, description), employmentType: jsonLdEmployment(description.match(/\b(full[- ]time|part[- ]time|contract|internship|temporary)\b/i)?.[1]?.replace(/[\s-]/g, "_")), method: "text" };
}

// ─────────────────────────── Service entry ───────────────────────────

type Actor = { id: string; role: Role };

/** Rate-limited fetch + extract for the workspace. Throws JobFetchError with a user-safe message. */
export async function fetchJobPosting(user: Actor, rawUrl: string, deps: Parameters<typeof fetchHtml>[1] = {}): Promise<JobFetchResult> {
  await enforceRateLimit("upload", `jobfetch:${user.id}`);
  const { html, finalUrl } = await fetchHtml(rawUrl, deps);
  const result = extractJobFromHtml(html, finalUrl);
  if (result.description.trim().length < 50) throw new JobFetchError("We couldn't find a job description on that page. Paste it manually.", "empty");
  return result;
}
