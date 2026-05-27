import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { analyze } from "./anthropic.ts";

function stubClient(
  finalMessage: unknown,
  opts?: { failTimes?: number; status?: number },
): Anthropic {
  let calls = 0;
  const failTimes = opts?.failTimes ?? 0;
  const stream = vi.fn(() => {
    calls++;
    if (calls <= failTimes) {
      const err = Object.assign(new Error("rate limited"), { status: opts?.status ?? 429 });
      return { finalMessage: () => Promise.reject(err) };
    }
    return { finalMessage: () => Promise.resolve(finalMessage) };
  });
  return { messages: { stream } } as unknown as Anthropic;
}

const goodMessage = {
  content: [
    { type: "thinking", thinking: "let me reason" },
    { type: "text", text: "  # Status\n\nbody  " },
  ],
  usage: {
    input_tokens: 1000,
    output_tokens: 200,
    cache_read_input_tokens: 800,
    cache_creation_input_tokens: 0,
  },
};

describe("analyze", () => {
  it("returns trimmed text + thinking + usage with a cost estimate", async () => {
    const client = stubClient(goodMessage);
    const result = await analyze(
      { systemPrompt: "sys", userPrompt: "u", modelId: "claude-sonnet-4-6", maxTokens: 1000 },
      client,
    );
    expect(result.text).toBe("# Status\n\nbody");
    expect(result.thinking).toBe("let me reason");
    expect(result.usage.cache_read_input_tokens).toBe(800);
    expect(result.usage.cost_estimate_usd).toBeGreaterThan(0);
  });

  it("retries on 429 then succeeds", async () => {
    const client = stubClient(goodMessage, { failTimes: 1, status: 429 });
    const result = await analyze(
      { systemPrompt: "sys", userPrompt: "u", modelId: "claude-sonnet-4-6", maxTokens: 1000 },
      client,
    );
    expect(result.text).toContain("Status");
  });

  it("prices opus higher than sonnet for identical usage", async () => {
    const sonnet = await analyze(
      { systemPrompt: "s", userPrompt: "u", modelId: "claude-sonnet-4-6", maxTokens: 1000 },
      stubClient(goodMessage),
    );
    const opus = await analyze(
      { systemPrompt: "s", userPrompt: "u", modelId: "claude-opus-4-7", maxTokens: 1000 },
      stubClient(goodMessage),
    );
    expect(opus.usage.cost_estimate_usd).toBeGreaterThan(sonnet.usage.cost_estimate_usd);
  });
});
