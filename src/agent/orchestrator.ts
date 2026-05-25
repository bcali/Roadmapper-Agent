/**
 * Nightly entrypoint. `npm run agent` runs this directly.
 *
 * Phase 1 flow:
 *   1. Load config + env (fail fast on missing creds).
 *   2. Fetch claude_summary.md, roadmap.json, kpis.json from the dashboard repo.
 *   3. Wrap the summary as a single Signal; normalize.
 *   4. Load agent memory.
 *   5. Synthesize.
 *   6. Write outputs + telemetry.
 *
 * Slack/Outlook/Teams collectors land in Phases 2/3/4. They will be
 * called in parallel and a single connector failure must not kill the
 * run (use try/catch around each, log the failure, continue).
 */

import { writeOutputs } from "../audit/logger.ts";
import { getGitHubClient } from "../connectors/github.ts";
import { runDateString } from "../lib/clock.ts";
import { loadAgentConfig, loadEnv } from "../lib/config.ts";
import type { Signal } from "../lib/types.ts";
import { normalize } from "../normalize/normalize.ts";
import { loadMemory } from "./memory.ts";
import { synthesize } from "./synthesize.ts";

export interface OrchestratorResult {
  runDate: string;
  outputs: { jsonPath: string; markdownPath: string };
  changesProposed: number;
  signalsIngested: number;
}

export async function runOrchestrator(): Promise<OrchestratorResult> {
  const env = loadEnv();
  const config = loadAgentConfig();
  const runDate = runDateString(env.TIMEZONE);

  console.log(`[agent] start run_date=${runDate} timezone=${env.TIMEZONE} repo=${env.GITHUB_REPO}`);

  const github = getGitHubClient();
  const [claudeSummary, roadmap, kpis, memory] = await Promise.all([
    github.fetchTextFile(config.dashboard_paths.claude_summary),
    github.fetchJsonFile(config.dashboard_paths.roadmap),
    github.fetchJsonFile(config.dashboard_paths.kpis),
    loadMemory(),
  ]);

  const rawSignals: Signal[] = [
    {
      source: "claude_summary",
      timestamp_utc: new Date().toISOString(),
      author: "brian",
      text: claudeSummary,
      ref: `github:${env.GITHUB_REPO}:${config.dashboard_paths.claude_summary}`,
    },
  ];
  const signals = normalize(rawSignals);
  console.log(`[agent] signals=${signals.length} after_normalize`);

  const { proposal, usage } = await synthesize({
    runDate,
    signals,
    roadmap,
    kpis,
    memory,
  });

  const outputs = await writeOutputs({ runDate, proposal, signals, usage });

  console.log(
    `[agent] done changes=${proposal.changes.length} unmapped=${proposal.unmapped_signals.length} tokens_in=${usage.input_tokens} tokens_out=${usage.output_tokens} cache_read=${usage.cache_read_input_tokens}`,
  );

  return {
    runDate,
    outputs,
    changesProposed: proposal.changes.length,
    signalsIngested: signals.length,
  };
}

// Entry point when invoked via `npm run agent`.
// Distinguishes "imported by tests" from "executed directly" without import.meta complications.
const isDirectInvocation = process.argv[1]?.endsWith("orchestrator.ts");
if (isDirectInvocation) {
  runOrchestrator()
    .then((r) => {
      console.log(`[agent] outputs written to ${r.outputs.jsonPath}`);
    })
    .catch((err: unknown) => {
      console.error("[agent] FAILED", err);
      process.exitCode = 1;
    });
}
