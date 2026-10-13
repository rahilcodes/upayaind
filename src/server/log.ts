import "server-only";
import { currentRequestId, getRequestId } from "./request";
import { scrubValue } from "@/lib/sentry-scrub";

/**
 * Structured logging (DECISIONS D-131).
 *
 *   log.info("email.sent", { to, template });
 *   log.error("job.failed", { job: id, err });
 *
 * Production: one JSON object per line (`{"level","time","event","requestId",...}`)
 * for log drains. Development/test: a readable single line. Fields named like
 * secrets (`*Enc`, password, token…) are redacted; `err` / `error` values are
 * normalised to `{ name, message, stack }`.
 *
 * The request id comes from `getRequestId()` (x-request-id header or a
 * generated id) when called inside a request, or from `withRequestId()`.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const isProd = process.env.NODE_ENV === "production";
const minLevel = LEVELS[(process.env.LOG_LEVEL as LogLevel) ?? (process.env.NODE_ENV === "test" ? "warn" : "debug")] ?? LEVELS.debug;

function serializeError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: isProd ? e.stack?.split("\n").slice(0, 8).join("\n") : e.stack, ...(e.cause ? { cause: serializeError(e.cause) } : {}) };
  }
  if (typeof e === "object" && e !== null) return scrubValue(e as Record<string, unknown>);
  return { message: String(e) };
}

function normalise(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out[k] = k === "err" || k === "error" ? serializeError(v) : v;
  }
  return scrubValue(out);
}

function write(level: LogLevel, event: string, fields: LogFields, requestId: string | undefined) {
  const record = { level, time: new Date().toISOString(), event, ...(requestId ? { requestId } : {}), ...fields };
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : level === "debug" ? console.debug : console.info;
  if (isProd) {
    fn(JSON.stringify(record));
    return;
  }
  const tag = { debug: "DBG", info: "INF", warn: "WRN", error: "ERR" }[level];
  const rest = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  fn(`${tag} ${event}${requestId ? ` [${requestId}]` : ""}${rest ? ` ${rest}` : ""}`);
}

function emit(level: LogLevel, event: string, fields: LogFields = {}) {
  if (LEVELS[level] < minLevel) return;
  const safe = normalise(fields);
  const sync = currentRequestId();
  if (sync !== undefined) {
    write(level, event, safe, sync);
    return;
  }
  // Inside a request the id lives in the header store (async); outside one it resolves to undefined.
  void getRequestId()
    .catch(() => undefined)
    .then((id) => write(level, event, safe, id));
}

export const log = {
  debug: (event: string, fields?: LogFields) => emit("debug", event, fields),
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
  /** Pre-bound fields (e.g. `const l = log.child({ job: "daily-digest" })`). */
  child: (base: LogFields) => ({
    debug: (event: string, fields?: LogFields) => emit("debug", event, { ...base, ...fields }),
    info: (event: string, fields?: LogFields) => emit("info", event, { ...base, ...fields }),
    warn: (event: string, fields?: LogFields) => emit("warn", event, { ...base, ...fields }),
    error: (event: string, fields?: LogFields) => emit("error", event, { ...base, ...fields }),
  }),
};

/** Exported for tests. */
export const _internal = { normalise, serializeError };
