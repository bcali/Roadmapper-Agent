/**
 * Commits a generated weekly input file to the dashboard repo.
 *
 * Target path: <inputsPath>/<week>/<filename>  (e.g. inputs/weekly/2026-W22/status.md)
 *
 * No-op detection: read the existing file first; if its decoded content is
 * byte-identical to what we'd write, skip the commit. This is what makes the
 * daily cron a no-op when nothing changed — we regenerate the week-to-date
 * file each run and only push when it actually differs.
 *
 * SHA handling follows the dashboard's docs/discoveries/GITHUB_API.md: you
 * must pass the current blob SHA when updating an existing file.
 */

import type { OctokitRequester } from "./github.ts";

export interface CommitInputFileArgs {
  requester: OctokitRequester;
  owner: string;
  repo: string;
  branch: string;
  inputsPath: string;
  week: string;
  filename: string;
  content: string;
  /** Commit message; defaults to a conventional agent message. */
  message?: string;
}

export interface CommitResult {
  committed: boolean;
  path: string;
  reason: "created" | "updated" | "unchanged";
}

interface ContentResponse {
  sha?: string;
  content?: string;
  encoding?: string;
}

function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n").trimEnd();
}

export async function commitInputFile(args: CommitInputFileArgs): Promise<CommitResult> {
  const path = `${args.inputsPath}/${args.week}/${args.filename}`;
  const message = args.message ?? `agent: ${args.week} ${args.filename} (auto-extracted)`;

  let existingSha: string | undefined;
  let existingContent: string | undefined;
  try {
    const resp = await args.requester.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner: args.owner,
      repo: args.repo,
      path,
      ref: args.branch,
    });
    const data = resp.data as ContentResponse;
    existingSha = data.sha;
    if (data.content) {
      existingContent = Buffer.from(
        data.content,
        (data.encoding ?? "base64") as BufferEncoding,
      ).toString("utf8");
    }
  } catch (err) {
    // 404 = file doesn't exist yet; any other error is real.
    const status = (err as { status?: number })?.status;
    if (status !== 404) throw err;
  }

  if (existingContent !== undefined && normalize(existingContent) === normalize(args.content)) {
    return { committed: false, path, reason: "unchanged" };
  }

  await args.requester.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner: args.owner,
    repo: args.repo,
    path,
    message,
    content: Buffer.from(args.content, "utf8").toString("base64"),
    branch: args.branch,
    ...(existingSha ? { sha: existingSha } : {}),
  });

  return { committed: true, path, reason: existingSha ? "updated" : "created" };
}
