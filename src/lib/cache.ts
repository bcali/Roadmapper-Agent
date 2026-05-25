/**
 * Helpers for Anthropic prompt caching.
 *
 * Stable, slow-changing content (base system prompt, distilled rules,
 * roadmap snapshot) gets wrapped with cache_control: { type: "ephemeral" }.
 * Volatile content (recent lessons window, today's signals) does NOT, so
 * the cache reuses the stable prefix across nightly runs.
 *
 * Cost effect: cache hits are ~10% of input token price. For a nightly
 * batch with a ~30k-token stable prefix this is the difference between
 * pennies and dollars per run.
 *
 * Docs: https://docs.claude.com/en/docs/build-with-claude/prompt-caching
 */

import type Anthropic from "@anthropic-ai/sdk";

type TextBlockParam = Anthropic.TextBlockParam;

export function cachedText(text: string): TextBlockParam {
  return { type: "text", text, cache_control: { type: "ephemeral" } };
}

export function plainText(text: string): TextBlockParam {
  return { type: "text", text };
}
