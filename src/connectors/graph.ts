/**
 * Microsoft Graph app-only (client-credentials) auth + GET helper.
 *
 * Shared by outlook.ts and teams.ts. Activated when the Azure AD app exists
 * and Minor IT has granted admin consent for the required application
 * permissions (Mail.Read, OnlineMeetingTranscript.Read.All). Until then the
 * connectors throw a clear error and the orchestrator treats it as "no
 * signal from this source" (no-op).
 *
 * HTTP layer injected for testability.
 */

export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** UPN or object id of the mailbox/meetings owner (Brian). */
  userId: string;
}

type FetchLike = typeof fetch;

const GRAPH = "https://graph.microsoft.com/v1.0";

export function assertGraphConfig(cfg: Partial<GraphConfig>): asserts cfg is GraphConfig {
  for (const k of ["tenantId", "clientId", "clientSecret", "userId"] as const) {
    if (!cfg[k]) throw new Error(`Microsoft Graph requires ${k} (set AZURE_*/GRAPH_USER_ID)`);
  }
}

export async function getAppToken(cfg: GraphConfig, fetchImpl: FetchLike = fetch): Promise<string> {
  const url = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });
  const resp = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    throw new Error(`Graph token request failed: ${resp.status} ${resp.statusText}`);
  }
  const json = (await resp.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Graph token response had no access_token");
  return json.access_token;
}

/** GET a Graph path (absolute or relative to /v1.0). `accept` allows text/vtt for transcript content. */
export async function graphGet<T = unknown>(
  token: string,
  path: string,
  fetchImpl: FetchLike = fetch,
  accept = "application/json",
): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH}${path}`;
  const resp = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept },
  });
  if (!resp.ok) {
    throw new Error(`Graph GET ${path} failed: ${resp.status} ${resp.statusText}`);
  }
  return (accept === "application/json" ? await resp.json() : await resp.text()) as T;
}
