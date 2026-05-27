/**
 * Anthropic call wrapper — ported and adapted from the dashboard's
 * scripts/lib/anthropic.ts so the agent's synthesis behaves like the
 * existing pipeline (prompt caching on static context, extended thinking,
 * retry on 429/529, cost estimation).
 *
 * Differences from the dashboard version:
 *  - Takes a concrete model ID string (config-driven) rather than an
 *    "opus" | "sonnet" enum, so the escalation model is a config knob.
 *  - Returns the structured usage block the audit logger records.
 *  - The Anthropic client is injectable for tests.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface AnalyzeRequest {
  systemPrompt: string;
  /** Static context (roadmap snapshot, baseline rules) — cached across runs. */
  cachedContext?: string;
  userPrompt: string;
  modelId: string;
  maxTokens: number;
  /** Extended-thinking budget; omit/0 to disable thinking. */
  thinkingBudgetTokens?: number;
}

export interface AnalyzeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_estimate_usd: number;
}

export interface AnalyzeResult {
  thinking: string;
  text: string;
  usage: AnalyzeUsage;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

// Per-million-token pricing, selected by model family substring.
const PRICING = {
  opus: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
} as const;

function pricingFor(modelId: string): (typeof PRICING)[keyof typeof PRICING] {
  if (modelId.includes("opus")) return PRICING.opus;
  if (modelId.includes("haiku")) return PRICING.haiku;
  return PRICING.sonnet;
}

let cachedClient: Anthropic | undefined;
function defaultClient(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

export async function analyze(
  req: AnalyzeRequest,
  client: Anthropic = defaultClient(),
): Promise<AnalyzeResult> {
  const pricing = pricingFor(req.modelId);

  const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
    { type: "text", text: req.systemPrompt },
  ];
  if (req.cachedContext) {
    systemBlocks.push({
      type: "text",
      text: req.cachedContext,
      cache_control: { type: "ephemeral" },
    });
  }

  const thinking =
    req.thinkingBudgetTokens && req.thinkingBudgetTokens > 0
      ? ({ type: "enabled", budget_tokens: req.thinkingBudgetTokens } as const)
      : undefined;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stream = client.messages.stream({
        model: req.modelId,
        max_tokens: req.maxTokens,
        ...(thinking ? { thinking } : {}),
        system: systemBlocks,
        messages: [{ role: "user", content: req.userPrompt }],
      });
      const resp = await stream.finalMessage();

      let thinkingText = "";
      let text = "";
      for (const block of resp.content) {
        if (block.type === "thinking") thinkingText = block.thinking;
        else if (block.type === "text") text += block.text;
      }

      const input = resp.usage.input_tokens;
      const output = resp.usage.output_tokens;
      const cacheRead = resp.usage.cache_read_input_tokens ?? 0;
      const cacheCreate = resp.usage.cache_creation_input_tokens ?? 0;
      const uncachedInput = Math.max(0, input - cacheRead - cacheCreate);
      const cost =
        (uncachedInput / 1e6) * pricing.input +
        (cacheCreate / 1e6) * pricing.cacheWrite +
        (cacheRead / 1e6) * pricing.cacheRead +
        (output / 1e6) * pricing.output;

      return {
        thinking: thinkingText,
        text: text.trim(),
        usage: {
          input_tokens: input,
          output_tokens: output,
          cache_read_input_tokens: cacheRead,
          cache_creation_input_tokens: cacheCreate,
          cost_estimate_usd: cost,
        },
      };
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      if ((status === 429 || status === 529) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
        console.warn(
          `[anthropic] attempt ${attempt}/${MAX_RETRIES} got ${status}, retry in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error("analyze failed after retries");
}
