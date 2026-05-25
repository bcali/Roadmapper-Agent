/**
 * Deduplicate and trim signals before they hit the synthesizer.
 *
 * - Drops entries with empty/whitespace text.
 * - Deduplicates by exact text match (first occurrence wins so the ref of
 *   the earliest signal is preserved).
 * - Caps individual text length to 8 KB to bound transcript blow-ups.
 *
 * Stable sort: input order is preserved for surviving entries.
 */

import { createHash } from "node:crypto";
import type { NormalizedSignal, Signal } from "../lib/types.ts";

const MAX_TEXT_CHARS = 8_000;

export function normalize(signals: Signal[]): NormalizedSignal[] {
  const seen = new Set<string>();
  const out: NormalizedSignal[] = [];
  for (const raw of signals) {
    const text = (raw.text ?? "").trim();
    if (!text) continue;
    const key = createHash("sha256").update(text).digest("hex");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...raw, text: text.slice(0, MAX_TEXT_CHARS) });
  }
  return out;
}
