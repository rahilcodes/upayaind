import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/env";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";

/**
 * Anthropic client wrapper (SPEC §9.4).
 * - Structured output via a single forced tool whose input_schema is generated
 *   from the zod schema (`z.toJSONSchema`), then re-validated with zod.
 * - Every call is logged in AiUsage (tokens + cost estimate).
 * - Without ANTHROPIC_API_KEY every call throws a clear UserError.
 * - Tests inject a fake transport with `setAiTransport()` (no network).
 */

export type ModelTier = "main" | "fast";
export type AiTask = "parse_resume" | "analyze_jd" | "tailor_resume" | "cover_letter";

export type AiMessage = { role: "user" | "assistant"; content: string };

export type TransportRequest = {
  model: string;
  max_tokens: number;
  system: string;
  messages: AiMessage[];
  tools: { name: string; description: string; input_schema: Record<string, unknown> }[];
  tool_choice: { type: "tool"; name: string; disable_parallel_tool_use?: boolean };
  temperature?: number;
};
export type TransportResponse = {
  model: string;
  content: Array<{ type: string; name?: string; input?: unknown; text?: string }>;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
  stop_reason?: string | null;
};
export type AiTransport = (req: TransportRequest) => Promise<TransportResponse>;

let testTransport: AiTransport | null = null;
/** Tests only: replace the network call. Pass null to restore. */
export function setAiTransport(t: AiTransport | null) {
  testTransport = t;
}

export class AiNotConfiguredError extends UserError {
  constructor() {
    super("AI isn't configured on this server yet (ANTHROPIC_API_KEY is missing). You can still edit the base resume manually.");
    this.name = "UserError";
  }
}

/** Thrown when the model's output doesn't match the schema (callers may retry once). */
export class AiOutputError extends Error {
  constructor(
    message: string,
    public issues: string[],
    public raw: unknown,
  ) {
    super(message);
    this.name = "AiOutputError";
  }
}

export function aiConfigured() {
  return Boolean(testTransport || env.ANTHROPIC_API_KEY);
}

export function modelFor(tier: ModelTier) {
  return tier === "fast" ? (env.ANTHROPIC_MODEL_FAST ?? env.ANTHROPIC_MODEL) : env.ANTHROPIC_MODEL;
}

let sdk: Anthropic | null = null;
function transport(): AiTransport {
  if (testTransport) return testTransport;
  if (!env.ANTHROPIC_API_KEY) throw new AiNotConfiguredError();
  sdk ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 });
  const client = sdk;
  return async (req) => {
    const r = await client.messages.create(req as unknown as Anthropic.MessageCreateParamsNonStreaming);
    return r as unknown as TransportResponse;
  };
}

/**
 * Cost estimate in micro-USD. Prices are NOT hard-coded (they change and differ
 * per model): set ANTHROPIC_PRICE_INPUT_PER_MTOK / ANTHROPIC_PRICE_OUTPUT_PER_MTOK
 * (USD per million tokens, from the Anthropic pricing page) and optionally the
 * *_FAST variants for the fast model. Unset → cost 0 (tokens are still logged).
 */
export function estimateCostMicros(tier: ModelTier, inputTokens: number, outputTokens: number) {
  const num = (k: string) => {
    const v = Number(process.env[k]);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const inP = (tier === "fast" ? num("ANTHROPIC_PRICE_INPUT_PER_MTOK_FAST") : null) ?? num("ANTHROPIC_PRICE_INPUT_PER_MTOK") ?? 0;
  const outP = (tier === "fast" ? num("ANTHROPIC_PRICE_OUTPUT_PER_MTOK_FAST") : null) ?? num("ANTHROPIC_PRICE_OUTPUT_PER_MTOK") ?? 0;
  // $/MTok == micro-$ per token.
  return Math.round(inputTokens * inP + outputTokens * outP);
}

/** JSON Schema for a tool input (zod v4 → draft 2020-12, `input` view so defaults are optional). */
export function toolSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

function formatIssues(err: z.ZodError): string[] {
  return err.issues.slice(0, 25).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

export type CallToolInput<S extends z.ZodType> = {
  task: AiTask;
  tier?: ModelTier;
  schema: S;
  toolName: string;
  toolDescription: string;
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  userId: string;
  studentId?: string | null;
};

/** One structured call. Returns the zod-validated tool input. */
export async function callTool<S extends z.ZodType>(input: CallToolInput<S>): Promise<{ data: z.infer<S>; usage: { inputTokens: number; outputTokens: number; model: string } }> {
  const send = transport();
  const tier = input.tier ?? "main";
  const model = modelFor(tier);
  let res: TransportResponse;
  try {
    res = await send({
      model,
      max_tokens: input.maxTokens ?? 8000,
      system: input.system,
      messages: input.messages,
      tools: [{ name: input.toolName, description: input.toolDescription, input_schema: toolSchema(input.schema) }],
      tool_choice: { type: "tool", name: input.toolName, disable_parallel_tool_use: true },
      temperature: input.temperature ?? 0.2,
    });
  } catch (e) {
    if (e instanceof UserError) throw e;
    const status = (e as { status?: number }).status;
    console.error(`[ai] ${input.task} failed`, status, (e as Error).message);
    if (status === 401 || status === 403) throw new UserError("The AI service rejected our API key. Ask an admin to check the Anthropic configuration.");
    if (status === 429 || status === 529) throw new UserError("The AI service is busy right now. Please try again in a minute.");
    throw new UserError("The AI service didn't respond. Please try again.");
  }

  const inputTokens = (res.usage?.input_tokens ?? 0) + (res.usage?.cache_creation_input_tokens ?? 0) + (res.usage?.cache_read_input_tokens ?? 0);
  const outputTokens = res.usage?.output_tokens ?? 0;
  await db.aiUsage
    .create({
      data: {
        userId: input.userId,
        studentId: input.studentId ?? null,
        task: input.task,
        model: res.model ?? model,
        inputTokens,
        outputTokens,
        costMicros: estimateCostMicros(tier, inputTokens, outputTokens),
      },
    })
    .catch((e) => console.error("[ai] usage log failed", e));

  const block = res.content.find((b) => b.type === "tool_use" && b.name === input.toolName);
  if (!block) throw new AiOutputError("The AI didn't return structured output.", ["no tool_use block"], res.content);
  const parsed = input.schema.safeParse(block.input);
  if (!parsed.success) throw new AiOutputError("The AI output didn't match the schema.", formatIssues(parsed.error), block.input);
  return { data: parsed.data, usage: { inputTokens, outputTokens, model: res.model ?? model } };
}
