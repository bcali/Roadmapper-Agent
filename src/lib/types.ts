/**
 * Shared types across connectors, normalizer, and agent.
 *
 * The canonical signal contract — every connector returns this shape.
 * Add new fields here when a connector needs to carry additional context.
 */

export type SignalSource = "confluence" | "slack" | "teams" | "outlook" | "claude_summary";

export interface Signal {
  source: SignalSource;
  /** ISO 8601 UTC timestamp */
  timestamp_utc: string;
  /** User ID, email, or "meeting" label */
  author: string;
  /** Raw text content (capped at 8000 chars by normalize()) */
  text: string;
  /** Stable reference back to the original (e.g. "slack:C123:1234567890.0001") */
  ref: string;
}

/** Output of normalize() — same shape as Signal, but deduplicated and trimmed. */
export type NormalizedSignal = Signal;
