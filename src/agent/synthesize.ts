/**
 * Status extraction — turns raw source signals into the dashboard's weekly
 * `status.md`.
 *
 * Replaces the original (now-removed) ProposedChanges synthesis. We emit
 * Markdown directly (matching how the manual Copilot prompt 03 works and how
 * the downstream analyze.ts consumes it) rather than a structured object.
 * The result is structurally validated by validate.ts before it is committed.
 *
 * The Anthropic client is injectable for tests via the analyze() wrapper.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { type AnalyzeUsage, analyze } from "../lib/anthropic.ts";
import { loadAgentConfig } from "../lib/config.ts";
import type { NormalizedSignal } from "../lib/types.ts";
import type { MemoryBundle } from "./memory.ts";
import { buildStatusCachedContext, buildStatusSystem, buildStatusUserMessage } from "./prompts.ts";

export interface ExtractStatusInput {
  week: string;
  signals: NormalizedSignal[];
  roadmap: unknown;
  kpis: unknown;
  memory: MemoryBundle;
  today?: Date;
}

export interface ExtractStatusResult {
  markdown: string;
  usage: AnalyzeUsage;
}

export async function extractStatus(
  input: ExtractStatusInput,
  client?: Anthropic,
): Promise<ExtractStatusResult> {
  const config = loadAgentConfig();
  const { text, usage } = await analyze(
    {
      systemPrompt: buildStatusSystem(input.memory),
      cachedContext: buildStatusCachedContext(input.roadmap, input.kpis),
      userPrompt: buildStatusUserMessage({
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
