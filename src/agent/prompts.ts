/**
 * System prompt + user message composition.
 *
 * Cache placement is deliberate (see src/lib/cache.ts and Anthropic prompt
 * caching docs). The system prompt is split into two cached blocks and one
 * uncached suffix:
 *
 *   1. BASE_SYSTEM         (cached) — always the same; rarely edited
 *   2. memory.rules        (cached) — distilled prompt-rules.md; promoted manually
 *   3. recent lessons      (NOT cached) — last 30 days, changes weekly
 *
 * The user message carries the volatile per-run content (roadmap snapshot,
 * KPIs, tonight's signals).
 */

import type Anthropic from "@anthropic-ai/sdk";
import { cachedText, plainText } from "../lib/cache.ts";
import type { NormalizedSignal } from "../lib/types.ts";
import { type MemoryBundle, sliceRecentLessons } from "./memory.ts";

type SystemContent = Anthropic.TextBlockParam[];

const BASE_SYSTEM = `You are the roadmap synthesis agent for "Operation Money Tree", Minor Hotels' payments-modernization program. Each night you receive raw signals from Slack, Microsoft Teams meeting transcripts, Outlook emails, and a daily Claude conversation summary, plus the current roadmap state (epics with statuses and business-case values).

Your job: detect what CHANGED versus the current roadmap and emit a list of proposed updates by calling the \`emit_proposed_changes\` tool.

Rules:
- Bias toward OVER-flagging during the pilot. If a signal plausibly indicates a blocker, slip, scope change, or risk shift, surface it.
- Every proposed change MUST cite at least one source_ref that triggered it.
- Map each change to an existing epic_id when possible. If a signal implies a new epic or dependency that has no existing epic_id, set epic_id to null and use change_type "new".
- Recalculate business_case_delta only when the signals support it; show your reasoning briefly in \`rationale\`.
- Assign a confidence score 0.0–1.0 per change. Calibrate honestly — an explicit "blocked on X" statement warrants ≥0.7, vague concern language warrants ≤0.5.
- NEVER invent facts not present in the signals or roadmap.
- Signals you reviewed but intentionally did NOT turn into a change go into \`unmapped_signals\` with a one-line reason. This is how the morning review catches false negatives.
- Output ONLY by invoking the emit_proposed_changes tool. Do not write prose.`;

export function composeSystemPrompt(
  memory: MemoryBundle,
  lessonLookbackDays: number,
  today = new Date(),
): SystemContent {
  const blocks: SystemContent = [cachedText(BASE_SYSTEM)];

  const rules = memory.rules.trim();
  if (rules) blocks.push(cachedText(`## Distilled rules from past feedback\n\n${rules}`));

  const recentLessons = sliceRecentLessons(memory.lessons, lessonLookbackDays, today);
  if (recentLessons) {
    blocks.push(
      plainText(`## Recent lessons (trailing ${lessonLookbackDays} days)\n\n${recentLessons}`),
    );
  }
  return blocks;
}

export interface UserMessageInput {
  runDate: string;
  signals: NormalizedSignal[];
  roadmap: unknown;
  kpis: unknown;
}

export function renderUserMessage(input: UserMessageInput): string {
  return [
    `Tonight's run: ${input.runDate}`,
    "",
    "### Current roadmap snapshot",
    "```json",
    JSON.stringify(input.roadmap, null, 2),
    "```",
    "",
    "### Current KPIs",
    "```json",
    JSON.stringify(input.kpis, null, 2),
    "```",
    "",
    `### Signals ingested in the last 24h (${input.signals.length} total)`,
    "```json",
    JSON.stringify(input.signals, null, 2),
    "```",
    "",
    "Invoke emit_proposed_changes with your analysis.",
  ].join("\n");
}
