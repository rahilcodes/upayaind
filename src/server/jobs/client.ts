import "server-only";
import { Inngest } from "inngest";
import { env, integrations } from "@/env";

/**
 * Background jobs (SPEC §4: Inngest). Every job is declared with `defineJob`,
 * which registers an Inngest function AND a local handler. When Inngest isn't
 * configured (local dev, tests) `emit()` runs the local handlers in-process so
 * the product still works end to end. See docs/DECISIONS.md D-013.
 */
export const inngest = new Inngest({ id: "upayaind", eventKey: env.INNGEST_EVENT_KEY });

type Handler = (data: Record<string, unknown>) => Promise<unknown>;
type JobDef = { id: string; event?: string; cron?: string; run: Handler; concurrencyKey?: string };

const localByEvent = new Map<string, JobDef[]>();
const localById = new Map<string, JobDef>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const inngestFunctions: any[] = [];

export function defineJob<T extends Record<string, unknown>>(def: {
  id: string;
  event?: string;
  cron?: string;
  /** Optional: serialise runs that share this event field (e.g. "studentId"). */
  concurrencyKey?: string;
  retries?: number;
  run: (data: T) => Promise<unknown>;
}) {
  const job: JobDef = { id: def.id, event: def.event, cron: def.cron, run: def.run as Handler, concurrencyKey: def.concurrencyKey };
  if (def.event) localByEvent.set(def.event, [...(localByEvent.get(def.event) ?? []).filter((j) => j.id !== def.id), job]);
  localById.set(def.id, job);
  const triggers = def.event ? [{ event: def.event }] : def.cron ? [{ cron: def.cron }] : [];
  const fn = inngest.createFunction(
    {
      id: def.id,
      triggers,
      retries: def.retries ?? 3,
      ...(def.concurrencyKey ? { concurrency: { limit: 1, key: `event.data.${def.concurrencyKey}` } } : {}),
    } as never,
    async ({ event }: { event: { data: T } }) => def.run((event?.data ?? {}) as T),
  );
  inngestFunctions.push(fn);
  return job;
}

const inngestEnabled = () => integrations.inngest || Boolean(process.env.INNGEST_DEV);

/** Publish an event. Falls back to running local handlers when Inngest isn't configured. */
export async function emit(name: string, data: Record<string, unknown>, opts: { sync?: boolean } = {}) {
  if (inngestEnabled() && !opts.sync) {
    await inngest.send({ name, data });
    return;
  }
  const jobs = localByEvent.get(name) ?? [];
  const runAll = Promise.all(
    jobs.map((j) =>
      j.run(data).catch((e) => {
        console.error(`[job ${j.id}] failed`, e);
        if (opts.sync) throw e;
      }),
    ),
  );
  if (opts.sync || process.env.NODE_ENV === "test" || process.env.INLINE_JOBS === "sync") await runAll;
  else void runAll;
}

/** Run a job by id right now (admin "run now", tests, local cron). */
export async function runJob(id: string, data: Record<string, unknown> = {}) {
  const job = localById.get(id);
  if (!job) throw new Error(`Unknown job ${id}`);
  return job.run(data);
}

export function listJobs() {
  return [...localById.values()].map((j) => ({ id: j.id, event: j.event ?? null, cron: j.cron ?? null }));
}
