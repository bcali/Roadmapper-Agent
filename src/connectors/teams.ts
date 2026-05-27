/**
 * Teams source connector → feeds meetings.md.
 *
 * App-only Microsoft Graph read of the user's recent online-meeting
 * transcripts. Flow: list the user's online meetings created in the window →
 * for each, list transcripts → fetch transcript content (VTT). Each
 * transcript becomes a Signal.
 *
 * NOTE: Graph's online-meeting/transcript discovery is finicky under app-only
 * auth and partly beta; the exact list endpoint may need adjustment when we
 * activate this with real credentials (Phase D, after the application access
 * policy is granted). The Signal mapping + token usage below are what the
 * tests pin down.
 */

import type { Signal } from "../lib/types.ts";
import { assertGraphConfig, type GraphConfig, getAppToken, graphGet } from "./graph.ts";

interface OnlineMeeting {
  id: string;
  subject?: string;
  creationDateTime?: string;
}
interface Transcript {
  id: string;
  createdDateTime?: string;
}

export interface FetchTranscriptsOptions {
  sinceIso: string;
}

export async function fetchRecentTranscripts(
  cfg: Partial<GraphConfig>,
  opts: FetchTranscriptsOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<Signal[]> {
  assertGraphConfig(cfg);
  const token = await getAppToken(cfg, fetchImpl);
  const user = encodeURIComponent(cfg.userId);

  const meetings = await graphGet<{ value?: OnlineMeeting[] }>(
    token,
    `/users/${user}/onlineMeetings?$filter=creationDateTime ge ${opts.sinceIso}`,
    fetchImpl,
  );

  const out: Signal[] = [];
  for (const m of meetings.value ?? []) {
    const transcripts = await graphGet<{ value?: Transcript[] }>(
      token,
      `/users/${user}/onlineMeetings/${m.id}/transcripts`,
      fetchImpl,
    );
    for (const t of transcripts.value ?? []) {
      const content = await graphGet<string>(
        token,
        `/users/${user}/onlineMeetings/${m.id}/transcripts/${t.id}/content`,
        fetchImpl,
        "text/vtt",
      );
      out.push({
        source: "teams",
        timestamp_utc: t.createdDateTime ?? m.creationDateTime ?? new Date().toISOString(),
        author: m.subject ?? "meeting",
        text: `Meeting: ${m.subject ?? "(untitled)"}\n\n${content}`,
        ref: `teams:${m.id}:${t.id}`,
      });
    }
  }
  return out;
}
