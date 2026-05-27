/**
 * GitHub connector — reads context files from the dashboard repo
 * (`bcali/roadmap-dashboard`) and exposes the authenticated requester so
 * dashboard-writer.ts can commit generated input files back.
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
let cachedRequester: OctokitRequester | undefined;

export function getGitHubClient(): GitHubClient {
  if (cachedClient) return cachedClient;
  const env = loadEnv();
  const [owner, repo] = env.GITHUB_REPO.split("/", 2) as [string, string];
  cachedClient = makeClient(getOctokitRequester(), owner, repo, env.GITHUB_BRANCH);
  return cachedClient;
}

/** The authenticated Octokit requester, for write paths (dashboard-writer). */
export function getOctokitRequester(): OctokitRequester {
  if (cachedRequester) return cachedRequester;
  const env = loadEnv();
  cachedRequester = new Octokit({ auth: env.GITHUB_TOKEN }) as unknown as OctokitRequester;
  return cachedRequester;
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
  cachedRequester = undefined;
}
