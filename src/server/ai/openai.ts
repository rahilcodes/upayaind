import "server-only";
import type { AiTransport, TransportRequest, TransportResponse } from "@/server/ai/client";

/**
 * OpenAI transport for the resume AI (D-136). Speaks the Chat Completions API
 * over plain fetch (no SDK) and maps to/from the Messages-shaped request that
 * `callTool()` builds, so prompts, zod validation, the §9.4 validator and
 * AiUsage logging are shared with the Anthropic path.
 *
 * Structured output: the single tool becomes a forced function call
 * (`tool_choice: {type:"function"}`); its JSON arguments are parsed here and
 * re-validated with zod by `callTool()`.
 */

type ChatCompletion = {
  model: string;
  choices: Array<{
    finish_reason?: string | null;
    message: { content?: string | null; tool_calls?: Array<{ type: string; function: { name: string; arguments: string } }> };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** Reasoning models (gpt-5*, o-series) reject a custom temperature and spend completion tokens on reasoning. */
export function isReasoningModel(model: string) {
  return /^(gpt-5|o\d)/i.test(model);
}

/** Extra completion budget for reasoning tokens, on top of the visible output budget. */
const REASONING_HEADROOM = 16_000;

export function toOpenAiRequest(req: TransportRequest) {
  const reasoning = isReasoningModel(req.model);
  return {
    model: req.model,
    messages: [{ role: "system", content: req.system }, ...req.messages.map((m) => ({ role: m.role, content: m.content }))],
    tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
    tool_choice: { type: "function", function: { name: req.tool_choice.name } },
    parallel_tool_calls: false,
    max_completion_tokens: req.max_tokens + (reasoning ? REASONING_HEADROOM : 0),
    // Structured rewrites don't need deep reasoning; keeps tailoring inside the 120 s route budget.
    ...(reasoning ? { reasoning_effort: "low" } : {}),
    ...(reasoning || req.temperature === undefined ? {} : { temperature: req.temperature }),
  };
}

export function fromOpenAiResponse(res: ChatCompletion): TransportResponse {
  const choice = res.choices?.[0];
  const content: TransportResponse["content"] = [];
  if (choice?.message?.content) content.push({ type: "text", text: choice.message.content });
  for (const call of choice?.message?.tool_calls ?? []) {
    if (call.type !== "function") continue;
    let input: unknown;
    try {
      input = JSON.parse(call.function.arguments);
    } catch {
      // Truncated or malformed JSON: leave input undefined so zod reports it (callers retry once).
      input = undefined;
    }
    content.push({ type: "tool_use", name: call.function.name, input });
  }
  return {
    model: res.model,
    content,
    // prompt_tokens already includes cached tokens.
    usage: { input_tokens: res.usage?.prompt_tokens ?? 0, output_tokens: res.usage?.completion_tokens ?? 0 },
    stop_reason: choice?.finish_reason === "length" ? "max_tokens" : (choice?.finish_reason ?? null),
  };
}

class OpenAiHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);

export function openAiTransport(opts: { apiKey: string; baseUrl?: string; maxRetries?: number; timeoutMs?: number }): AiTransport {
  const url = `${(opts.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "")}/chat/completions`;
  const maxRetries = opts.maxRetries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 90_000;
  return async (req) => {
    const body = JSON.stringify(toOpenAiRequest(req));
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!r.ok) {
          const detail = await r.text().catch(() => "");
          throw new OpenAiHttpError(r.status, `OpenAI ${r.status}: ${detail.slice(0, 300)}`);
        }
        return fromOpenAiResponse((await r.json()) as ChatCompletion);
      } catch (e) {
        const status = e instanceof OpenAiHttpError ? e.status : null;
        const retryable = status === null ? (e as Error).name !== "TimeoutError" : RETRYABLE.has(status);
        if (!retryable || attempt >= maxRetries) throw e;
        await new Promise((res) => setTimeout(res, 500 * 2 ** attempt));
      }
    }
  };
}
