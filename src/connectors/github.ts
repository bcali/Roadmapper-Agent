/**
 * GitHub connector — reads text/JSON files from the dashboard repo
 * (`bcali/roadmap-dashboard` by default).
 *
 * Phase 1 only does reads. The write path (auto-commit roadmap.json) lands
 * in Phase 5 after the accuracy gate clears.
 */

import { Octokit } from "octokit";
import { loadEnv } from "../lib/config.ts";

export interface GitHubClient {
  fetchTextFile(path: string): Promise<string>;
  fetchJsonFile<T = unknown>(path: string): Promise<T>;
}

/**
 * Minimal slice of Octokit we actually depend on — keeps tests free of
 * Octokit's full `request` signature (defaults, endpoint, paginate, etc.).
 */
export interface OctokitRequester {
  request(route: string, params: Record<string, unknown>): Promise<{ data: unknown }>;
}

interface ContentResponse {
  type: string;
  encoding?: string;
  content?: string;
}

let cachedClient: GitHubClient | undefined;

export function getGitHubClient(): GitHubClient {
  if (cachedClient) return cachedClient;
  const env = loadEnv();
  const [owner, repo] = env.GITHUB_REPO.split("/", 2) as [string, string];
  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  cachedClient = makeClient(octokit as unknown as OctokitRequester, owner, repo, env.GITHUB_BRANCH);
  return cachedClient;
}

export function makeClient(
  octokit: OctokitRequester,
  owner: string,
  repo: string,
  ref: string,
): GitHubClient {
  return {
    async fetchTextFile(path: string): Promise<string> {
      const resp = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path,
        ref,
      });
      const data = resp.data as ContentResponse;
      if (data.type !== "file" || !data.content) {
        throw new Error(`${owner}/${repo}:${path} is not a file (got type=${data.type})`);
      }
      // GitHub contents API returns base64 by default
      return Buffer.from(data.content, (data.encoding ?? "base64") as BufferEncoding).toString(
        "utf8",
      );
    },
    async fetchJsonFile<T = unknown>(path: string): Promise<T> {
      const text = await this.fetchTextFile(path);
      return JSON.parse(text) as T;
    },
  };
}

export function resetGitHubClientForTests(): void {
  cachedClient = undefined;
}
