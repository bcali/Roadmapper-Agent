/**
 * Nightly entrypoint. `npm run agent` runs this directly.
 *
 * Phase A flow (Confluence → status.md):
 *   1. Resolve the current ISO week (agent's timezone).
 *   2. Pull raw signal from Confluence (latest weekly status page).
 *   3. Read roadmap.json + kpis.json from the dashboard for synthesis context.
 *   4. extractStatus → status.md markdown.
 *   5. Validate structure; abort the file on hard errors.
 *   6. Commit to bcali/roadmap-dashboard inputs/weekly/<week>/status.md
 *      (no-op if unchanged → daily cron is quiet when nothing moved).
 *   7. Write a local artifact + append run telemetry.
 *
 * Slack/Outlook/Teams sources and the emails/meetings files come in later
 * phases; each will add a signal collector and an extractor, wrapped so one
 * source failing doesn't kill the run.
 */

import { appendRunLog, type RunFileRecord, writeLocalArtifact } from "../audit/logger.ts";
import { fetchLatestStatusSignal } from "../connectors/confluence.ts";
import { commitInputFile } from "../connectors/dashboard-writer.ts";
import { getGitHubClient, getOctokitRequester } from "../connectors/github.ts";
import { runDateString } from "../lib/clock.ts";
import { loadAgentConfig, loadEnv } from "../lib/config.ts";
import type { Signal } from "../lib/types.ts";
import { isoWeekOf } from "../lib/week.ts";
import { normalize } from "../normalize/normalize.ts";
import { loadMemory } from "./memory.ts";
import { extractStatus } from "./synthesize.ts";
import { validateStatusMarkdown } from "./validate.ts";

export interface OrchestratorResult {
  week: string;
  files: RunFileRecord[];
}

export async function runOrchestrator(): Promise<OrchestratorResult> {
  const env = loadEnv();
  const config = loadAgentConfig();
  const week = isoWeekOf(runDateString(env.TIMEZONE));

  console.log(`[agent] start week=${week} tz=${env.TIMEZONE} dashboard=${env.GITHUB_REPO}`);

  // 1. Collect raw signal (Phase A: Confluence only).
  const signals: Signal[] = [];
  try {
    const statusSignal = await fetchLatestStatusSignal({
      baseUrl: config.confluence.base_url,
      indexPageId: config.confluence.index_page_id,
      email: env.ATLASSIAN_EMAIL ?? "",
      apiToken: env.ATLASSIAN_API_TOKEN ?? "",
    });
    if (statusSignal) signals.push(statusSignal);
  } catch (err) {
    console.error("[agent] confluence collector failed:", err);
  }

  const normalized = normalize(signals);
  console.log(`[agent] signals=${normalized.length} after_normalize`);
  if (normalized.length === 0) {
    console.log("[agent] no signal — nothing to synthesize. Exiting cleanly.");
    return { week, files: [] };
  }

  // 2. Synthesis context + memory.
  const github = getGitHubClient();
  const [roadmap, kpis, memory] = await Promise.all([
    github.fetchJsonFile(config.dashboard.roadmap),
    github.fetchJsonFile(config.dashboard.kpis),
    loadMemory(),
  ]);

  // 3. Extract status.md.
  const { markdown, usage } = await extractStatus({
    week,
    signals: normalized,
    roadmap,
    kpis,
    memory,
  });

  // 4. Validate before writing anywhere.
  const validation = validateStatusMarkdown(markdown);
  for (const w of validation.warnings) console.warn(`[agent] status.md warning: ${w}`);
  if (!validation.ok) {
    console.error(`[agent] status.md failed validation:\n  ${validation.errors.join("\n  ")}`);
  }

  // 5. Local artifact (always, for the workflow upload / dry-run inspection).
  await writeLocalArtifact("data/outputs", week, "status.md", markdown);

  // 6. Commit to the dashboard only when valid (and not a dry run).
  const dryRun = process.env.DRY_RUN === "true";
  const [owner, repo] = env.GITHUB_REPO.split("/", 2) as [string, string];
  let committed = false;
  let reason = dryRun ? "skipped-dry-run" : "skipped-invalid";
  if (validation.ok && dryRun) {
    console.log(
      "[agent] DRY_RUN=true — generated + validated status.md but skipping the dashboard commit",
    );
  }
  if (validation.ok && !dryRun) {
    const result = await commitInputFile({
      requester: getOctokitRequester(),
      owner,
      repo,
      branch: env.GITHUB_BRANCH,
      inputsPath: config.dashboard.inputs_path,
      week,
      filename: "status.md",
      content: markdown,
    });
    committed = result.committed;
    reason = result.reason;
    console.log(`[agent] status.md → ${result.path} (${result.reason})`);
  }

  const fileRecord: RunFileRecord = {
    filename: "status.md",
    committed,
    reason,
    validation_errors: validation.errors,
    validation_warnings: validation.warnings,
    usage,
  };
  await appendRunLog("data/runs.jsonl", {
    week,
    signals_ingested: normalized.length,
    files: [fileRecord],
  });

  console.log(
    `[agent] done committed=${committed} reason=${reason} cost=$${usage.cost_estimate_usd.toFixed(4)} cache_read=${usage.cache_read_input_tokens}`,
  );
  return { week, files: [fileRecord] };
}

const isDirectInvocation = process.argv[1]?.endsWith("orchestrator.ts");
if (isDirectInvocation) {
  runOrchestrator().catch((err: unknown) => {
    console.error("[agent] FAILED", err);
    process.exitCode = 1;
  });
}
