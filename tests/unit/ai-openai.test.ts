import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransportRequest } from "@/server/ai/client";
import { fromOpenAiResponse, isReasoningModel, openAiTransport, toOpenAiRequest } from "@/server/ai/openai";

const REQ: TransportRequest = {
  model: "gpt-5.5",
  max_tokens: 8000,
  system: "You tailor resumes.",
  messages: [
    { role: "user", content: "JD here" },
    { role: "assistant", content: "previous" },
  ],
  tools: [{ name: "submit_resume", description: "Return the resume", input_schema: { type: "object", properties: { a: { type: "string" } } } }],
  tool_choice: { type: "tool", name: "submit_resume", disable_parallel_tool_use: true },
  temperature: 0.2,
};

function completion(args: string, finish = "tool_calls") {
  return {
    model: "gpt-5.5-2026-07-01",
    choices: [{ finish_reason: finish, message: { content: null, tool_calls: [{ type: "function", function: { name: "submit_resume", arguments: args } }] } }],
    usage: { prompt_tokens: 1200, completion_tokens: 340 },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI transport mapping (D-136)", () => {
  it("maps system, messages and the forced tool to Chat Completions", () => {
    const body = toOpenAiRequest(REQ);
    expect(body.messages[0]).toEqual({ role: "system", content: "You tailor resumes." });
    expect(body.messages).toHaveLength(3);
    expect(body.tools[0]).toEqual({ type: "function", function: { name: "submit_resume", description: "Return the resume", parameters: REQ.tools[0].input_schema } });
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "submit_resume" } });
    expect(body.parallel_tool_calls).toBe(false);
  });

  it("omits temperature and adds reasoning headroom for reasoning models only", () => {
    expect(isReasoningModel("gpt-5.5")).toBe(true);
    expect(isReasoningModel("o4-mini")).toBe(true);
    expect(isReasoningModel("gpt-4.1")).toBe(false);
    const r = toOpenAiRequest(REQ);
    expect(r).not.toHaveProperty("temperature");
    expect(r).not.toHaveProperty("reasoning_effort");
    expect(r.max_completion_tokens).toBeGreaterThan(8000);
    const c = toOpenAiRequest({ ...REQ, model: "gpt-4.1" });
    expect(c).toMatchObject({ temperature: 0.2, max_completion_tokens: 8000 });
    expect(c).not.toHaveProperty("reasoning_effort");
  });

  it("parses tool-call arguments into a tool_use block with usage", () => {
    const res = fromOpenAiResponse(completion('{"a":"x"}'));
    expect(res.content).toEqual([{ type: "tool_use", name: "submit_resume", input: { a: "x" } }]);
    expect(res.usage).toEqual({ input_tokens: 1200, output_tokens: 340 });
    expect(res.model).toBe("gpt-5.5-2026-07-01");
  });

  it("leaves input undefined on truncated JSON and reports max_tokens", () => {
    const res = fromOpenAiResponse(completion('{"a":"x', "length"));
    expect(res.content[0]).toMatchObject({ type: "tool_use", input: undefined });
    expect(res.stop_reason).toBe("max_tokens");
  });

  it("posts to the configured endpoint, retries 429 and surfaces 401 status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion('{"a":"ok"}')), { status: 200 }))
      .mockResolvedValueOnce(new Response("bad key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const send = openAiTransport({ apiKey: "sk-test", baseUrl: "https://example.test/v1/", maxRetries: 1 });
    const ok = await send(REQ);
    expect(ok.content[0]).toMatchObject({ input: { a: "ok" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/v1/chat/completions");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer sk-test");
    await expect(send(REQ)).rejects.toMatchObject({ status: 401 });
  });
});
