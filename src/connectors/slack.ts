/**
 * Slack source connector → feeds notes.md.
 *
 * Reads recent messages from a fixed set of tracked channels via the Slack
 * Web API (conversations.history), keeping only roadmap-relevant chatter
 * (decisions, blockers, status changes, action items). Each surviving message
 * becomes a Signal. Slack has no dedicated prompt in the dashboard's 01–04
 * set, so its output lands in notes.md (the dashboard's catch-all input type).
 *
 * Auth is a bot token (xoxb-) with channels:history + (for private channels)
 * groups:history, and the bot must be a member of each tracked channel. The
 * connector throws a clear error when the token is absent so the orchestrator
 * treats it as "no signal" (no-op) until Slack is provisioned.
 *
 * HTTP layer injected for testability.
 */

import type { Signal } from "../lib/types.ts";

export interface SlackConfig {
  token: string;
}

type FetchLike = typeof fetch;

const SLACK_API = "https://slack.com/api";
/** Bound the cursor loop so a busy channel can't run away with the run. */
const MAX_PAGES_PER_CHANNEL = 5;

export function assertSlackConfig(cfg: Partial<SlackConfig>): asserts cfg is SlackConfig {
  if (!cfg.token) throw new Error("Slack requires a bot token (set SLACK_BOT_TOKEN, xoxb-…)");
}

interface SlackMessage {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
}

interface HistoryResponse {
  ok: boolean;
  error?: string;
  messages?: SlackMessage[];
  response_metadata?: { next_cursor?: string };
}

export interface FetchMessagesOptions {
  channels: string[];
  /** ISO timestamp; only messages at/after this are returned. */
  sinceIso: string;
  /** Optional relevance prefilter (case-insensitive substring match on text). */
  keywords?: string[];
  /** Per-page message cap (Slack max 1000; default 200). */
  limit?: number;
}

async function slackGet<T>(
  token: string,
  method: string,
  params: Record<string, string>,
  fetchImpl: FetchLike,
): Promise<T> {
  const url = `${SLACK_API}/${method}?${new URLSearchParams(params).toString()}`;
  const resp = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    throw new Error(`Slack ${method} failed: ${resp.status} ${resp.statusText}`);
  }
  return (await resp.json()) as T;
}

/** Slack `ts` ("1700000000.000100") → ISO 8601 UTC. */
function tsToIso(ts: string): string {
  return new Date(Number.parseFloat(ts) * 1000).toISOString();
}

export async function fetchRecentMessages(
  cfg: Partial<SlackConfig>,
  opts: FetchMessagesOptions,
  fetchImpl: FetchLike = fetch,
): Promise<Signal[]> {
  assertSlackConfig(cfg);
  const oldest = String(Math.floor(new Date(opts.sinceIso).getTime() / 1000));
  const limit = String(opts.limit ?? 200);
  const out: Signal[] = [];

  for (const channel of opts.channels) {
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES_PER_CHANNEL; page++) {
      const params: Record<string, string> = { channel, oldest, limit };
      if (cursor) params.cursor = cursor;
      const data = await slackGet<HistoryResponse>(
        cfg.token,
        "conversations.history",
        params,
        fetchImpl,
      );
      if (!data.ok) {
        throw new Error(`Slack conversations.history error for ${channel}: ${data.error}`);
      }
      for (const m of data.messages ?? []) {
        // Keep only human messages with text; drop joins/leaves/bot noise.
        if (m.subtype || m.bot_id || !m.text?.trim() || !m.ts) continue;
        const text = m.text.trim();
        if (opts.keywords?.length) {
          const haystack = text.toLowerCase();
          if (!opts.keywords.some((k) => haystack.includes(k.toLowerCase()))) continue;
        }
        out.push({
          source: "slack",
          timestamp_utc: tsToIso(m.ts),
          author: m.user ?? "unknown",
          text,
          ref: `slack:${channel}:${m.ts}`,
        });
      }
      cursor = data.response_metadata?.next_cursor;
      if (!cursor) break;
    }
  }
  return out;
}
