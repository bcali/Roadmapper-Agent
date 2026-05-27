/**
 * Extraction — turns raw source signals into one of the dashboard's weekly
 * input files (status.md / emails.md / meetings.md).
 *
 * Emits Markdown directly (matching the manual Copilot prompts and how the
 * downstream analyze.ts consumes the files); validated by validate.ts before
 * commit. The Anthropic client is injectable via the analyze() wrapper.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { type AnalyzeUsage, analyze } from "../lib/anthropic.ts";
import { loadAgentConfig } from "../lib/config.ts";
import type { NormalizedSignal } from "../lib/types.ts";
import type { MemoryBundle } from "./memory.ts";
import { buildCachedContext, buildSystem, buildUserMessage, type ExtractKind } from "./prompts.ts";

export interface ExtractInput {
  kind: ExtractKind;
  week: string;
  signals: NormalizedSignal[];
  roadmap: unknown;
  kpis: unknown;
  memory: MemoryBundle;
  today?: Date;
}

export interface ExtractResult {
  markdown: string;
  usage: AnalyzeUsage;
}

export async function extract(input: ExtractInput, client?: Anthropic): Promise<ExtractResult> {
  const config = loadAgentConfig();
  const { text, usage } = await analyze(
    {
      systemPrompt: buildSystem(input.kind, input.memory),
      cachedContext: buildCachedContext(input.roadmap, input.kpis),
      userPrompt: buildUserMessage({
        kind: input.kind,
        week: input.week,
        signals: input.signals,
        memory: input.memory,
        lessonLookbackDays: config.lesson_lookback_days,
        today: input.today,
      }),
      modelId: config.model,
      maxTokens: config.max_tokens,
      thinkingBudgetTokens: config.thinking_budget_tokens,
    },
    client,
  );
  return { markdown: text, usage };
}
