/**
 * Run artifacts + telemetry.
 *
 * The agent's real output is committed to the dashboard repo by
 * dashboard-writer.ts. The logger's job here is local observability:
 *  - write a local copy of each generated file (for dry-run inspection and
 *    the workflow artifact upload)
 *  - append one JSON line per run to data/runs.jsonl (week, files, commit
 *    outcomes, validation, token usage/cost)
 */

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AnalyzeUsage } from "../lib/anthropic.ts";

export async function writeLocalArtifact(
  outputDir: string,
  week: string,
  filename: string,
  content: string,
): Promise<string> {
  const path = resolve(outputDir, week, filename);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return path;
}

export interface RunFileRecord {
  filename: string;
  committed: boolean;
  reason: string;
  validation_errors: string[];
  validation_warnings: string[];
  usage: AnalyzeUsage;
}

export interface RunRecord {
  week: string;
  signals_ingested: number;
  files: RunFileRecord[];
}

export async function appendRunLog(runsLogPath: string, record: RunRecord): Promise<void> {
  await mkdir(dirname(resolve(runsLogPath)), { recursive: true });
  await appendFile(
    resolve(runsLogPath),
    `${JSON.stringify({ logged_at: new Date().toISOString(), ...record })}\n`,
    "utf8",
  );
}
