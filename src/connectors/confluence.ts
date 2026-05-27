/**
 * Confluence source connector (Phase A).
 *
 * Mirrors the manual flow in the dashboard's prompts/03:
 *  1. Fetch the status-index page (a table whose rows link to each weekly
 *     status child page, newest on top).
 *  2. Parse the child page IDs out of that page; the first is the latest.
 *  3. Fetch that child page's body → return it as a Signal for synthesis.
 *
 * Auth: Atlassian REST v2 with Basic auth (email + API token). We request
 * `body-format=storage` (canonical XHTML incl. tables); Claude parses it
 * fine during synthesis — no markdown conversion needed here.
 *
 * The HTTP layer is injected (defaults to global fetch) for testability;
 * `extractChildPageIds` is pure and unit-tested directly.
 */

import type { Signal } from "../lib/types.ts";

export interface ConfluenceConfig {
  baseUrl: string;
  indexPageId: string;
  email: string;
  apiToken: string;
}

type FetchLike = typeof fetch;

interface PageResponse {
  id: string;
  title: string;
  body?: { storage?: { value?: string } };
  version?: { createdAt?: string; number?: number };
}

/**
 * Pull `/pages/<id>` references out of an index page's body, in document
 * order, de-duplicated, excluding the index page's own id. Handles both the
 * smartlink wrapper (newest row) and plain anchor links (older rows).
 */
export function extractChildPageIds(indexBody: string, excludeId: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>([excludeId]);
  const re = /\/pages\/(\d+)/g;
  let m: RegExpExecArray | null = re.exec(indexBody);
  while (m !== null) {
    const id = m[1];
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
    m = re.exec(indexBody);
  }
  return ids;
}

function authHeader(cfg: ConfluenceConfig): string {
  return `Basic ${Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64")}`;
}

async function getPage(
  cfg: ConfluenceConfig,
  pageId: string,
  fetchImpl: FetchLike,
): Promise<PageResponse> {
  const url = `${cfg.baseUrl}/wiki/api/v2/pages/${pageId}?body-format=storage`;
  const resp = await fetchImpl(url, {
    headers: { Authorization: authHeader(cfg), Accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`Confluence GET page ${pageId} failed: ${resp.status} ${resp.statusText}`);
  }
  return (await resp.json()) as PageResponse;
}

/**
 * Fetch the latest weekly status page as a Signal. Returns `null` when the
 * index has no linked child pages yet.
 */
export async function fetchLatestStatusSignal(
  cfg: ConfluenceConfig,
  fetchImpl: FetchLike = fetch,
): Promise<Signal | null> {
  if (!cfg.email || !cfg.apiToken) {
    throw new Error("Confluence requires ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN");
  }
  const index = await getPage(cfg, cfg.indexPageId, fetchImpl);
  const childIds = extractChildPageIds(index.body?.storage?.value ?? "", cfg.indexPageId);
  const latestId = childIds[0];
  if (!latestId) return null;

  const page = await getPage(cfg, latestId, fetchImpl);
  return {
    source: "confluence",
    timestamp_utc: page.version?.createdAt ?? new Date().toISOString(),
    author: "confluence-status",
    text: `# ${page.title}\n\n${page.body?.storage?.value ?? ""}`,
    ref: `confluence:page:${latestId}`,
  };
}
