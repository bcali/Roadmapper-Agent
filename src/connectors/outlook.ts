/**
 * Outlook source connector → feeds emails.md.
 *
 * App-only Microsoft Graph read of the user's recent mail. Optional keyword
 * filter keeps the digest to roadmap-relevant threads (the extractor does the
 * real relevance judgment; this just trims obvious noise and volume).
 *
 * Activated once the Azure app + Mail.Read admin consent are in place.
 */

import type { Signal } from "../lib/types.ts";
import { assertGraphConfig, type GraphConfig, getAppToken, graphGet } from "./graph.ts";

interface GraphMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  receivedDateTime?: string;
}

interface MessagesResponse {
  value?: GraphMessage[];
}

export interface FetchEmailsOptions {
  sinceIso: string;
  keywords?: string[];
  top?: number;
}

export async function fetchRecentEmails(
  cfg: Partial<GraphConfig>,
  opts: FetchEmailsOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<Signal[]> {
  assertGraphConfig(cfg);
  const token = await getAppToken(cfg, fetchImpl);

  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${opts.sinceIso}`,
    $select: "subject,from,receivedDateTime,bodyPreview,body",
    $top: String(opts.top ?? 50),
    $orderby: "receivedDateTime desc",
  });
  const data = await graphGet<MessagesResponse>(
    token,
    `/users/${encodeURIComponent(cfg.userId)}/messages?${params.toString()}`,
    fetchImpl,
  );

  const out: Signal[] = [];
  for (const m of data.value ?? []) {
    const subject = m.subject ?? "";
    const bodyText = m.body?.content ?? m.bodyPreview ?? "";
    if (opts.keywords?.length) {
      const haystack = `${subject}\n${bodyText}`.toLowerCase();
      if (!opts.keywords.some((k) => haystack.includes(k.toLowerCase()))) continue;
    }
    out.push({
      source: "outlook",
      timestamp_utc: m.receivedDateTime ?? new Date().toISOString(),
      author: m.from?.emailAddress?.address ?? m.from?.emailAddress?.name ?? "unknown",
      text: `Subject: ${subject}\n\n${bodyText}`,
      ref: `outlook:${m.id}`,
    });
  }
  return out;
}
