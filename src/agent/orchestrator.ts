/**
 * Nightly entrypoint. `npm run agent` runs this directly.
 *
 * Multi-source, multi-file: for each active producer it collects raw signal,
 * synthesizes the corresponding weekly input file, validates it, and commits
 * it to bcali/roadmap-dashboard at inputs/weekly/<ISO-week>/<file>.md
 * (no-op if unchanged → quiet daily cron). One producer failing (e.g. a
 * source whose credentials aren't provisioned yet) is logged and skipped; it
 * never kills the run.
 *
 * Active producers:
 *   - emails   ← Outlook (MS Graph)   → emails.md
 *   - meetings ← Teams (MS Graph)     → meetings.md
 *   - notes    ← Slack tracked chans  → notes.md
 * Parked (revive by re-adding to PRODUCERS):
 *   - status   ← Confluence           → status.md   (source currently dormant)
 *
 * DRY_RUN=true generates + validates + writes local artifacts but skips the
 * dashboard commit.
 */

import { appendRunLog, type RunFileRecord, writeLocalArtifact } from "../audit/logger.ts";
import { commitInputFile } from "../connectors/dashboard-writer.ts";
import { getGitHubClient, getOctokitRequester } from "../connectors/github.ts";
import type { GraphConfig } from "../connectors/graph.ts";
import { fetchRecentEmails } from "../connectors/outlook.ts";
import { fetchRecentMessages } from "../connectors/slack.ts";
import { fetchRecentTranscripts } from "../connectors/teams.ts";
import { hoursAgoIso, runDateString } from "../lib/clock.ts";
import { type AgentConfig, type Env, loadAgentConfig, loadEnv } from "../lib/config.ts";
import type { Signal } from "../lib/types.ts";
import { isoWeekOf } from "../lib/week.ts";
import { normalize } from "../normalize/normalize.ts";
import { loadMemory } from "./memory.ts";
import { type ExtractKind, filenameFor } from "./prompts.ts";
import { extract } from "./synthesize.ts";
import { validate } from "./validate.ts";

interface Producer {
  kind: ExtractKind;
  collect: () => Promise<Signal[]>;
}

function graphConfig(env: Env): Partial<GraphConfig> {
  return {
    tenantId: env.AZURE_TENANT_ID,
    clientId: env.AZURE_CLIENT_ID,
    clientSecret: env.AZURE_CLIENT_SECRET,
    userId: env.GRAPH_USER_ID,
  };
}

function buildProducers(env: Env, config: AgentConfig): Producer[] {
  const sinceIso = hoursAgoIso(config.lookback_days * 24);
  return [
    {
      kind: "emails",
      collect: () =>
        fetchRecentEmails(graphConfig(env), { sinceIso, keywords: config.email_keywords }),
    },
    {
      kind: "meetings",
      collect: () => fetchRecentTranscripts(graphConfig(env), { sinceIso }),
    },
    {
      kind: "notes",
      collect: () =>
        config.slack.channels.length === 0
          ? Promise.resolve([])
          : fetchRecentMessages(
              { token: env.SLACK_BOT_TOKEN },
              {
                channels: config.slack.channels,
                sinceIso,
                keywords: config.slack.keywords,
              },
            ),
    },
  ];
}

export interface OrchestratorResult {
  week: string;
  files: RunFileRecord[];
}

export async function runOrchestrator(): Promise<OrchestratorResult> {
  const env = loadEnv();
  const config = loadAgentConfig();
  const week = isoWeekOf(runDateString(env.TIMEZONE));
  const dryRun = process.env.DRY_RUN === "true";

  console.log(
    `[agent] start week=${week} tz=${env.TIMEZONE} dashboard=${env.GITHUB_REPO} dry_run=${dryRun}`,
  );

  // Synthesis context + memory, loaded once (lazily — only if a producer yields signal).
  let context:
    | { roadmap: unknown; kpis: unknown; memory: Awaited<ReturnType<typeof loadMemory>> }
    | undefined;
  const loadContext = async () => {
    if (context) return context;
    const github = getGitHubClient();
    const [roadmap, kpis, memory] = await Promise.all([
      github.fetchJsonFile(config.dashboard.roadmap),
      github.fetchJsonFile(config.dashboard.kpis),
      loadMemory(),
    ]);
    context = { roadmap, kpis, memory };
    return context;
  };

  const [owner, repo] = env.GITHUB_REPO.split("/", 2) as [string, string];
  const files: RunFileRecord[] = [];

  for (const producer of buildProducers(env, config)) {
    const filename = filenameFor(producer.kind);
    let signals: Signal[];
    try {
      signals = normalize(await producer.collect());
    } catch (err) {
      console.error(`[agent] ${producer.kind} collector failed (skipping):`, err);
      continue;
    }
    if (signals.length === 0) {
      console.log(`[agent] ${producer.kind}: no signal, skipping`);
      continue;
    }

    const { roadmap, kpis, memory } = await loadContext();
    const { markdown, usage } = await extract({
      kind: producer.kind,
      week,
      signals,
      roadmap,
      kpis,
      memory,
    });
    const validation = validate(producer.kind, markdown);
    for (const w of validation.warnings) console.warn(`[agent] ${filename} warning: ${w}`);
    if (!validation.ok)
      console.error(`[agent] ${filename} failed validation:\n  ${validation.errors.join("\n  ")}`);

    await writeLocalArtifact("data/outputs", week, filename, markdown);

    let committed = false;
    let reason = dryRun ? "skipped-dry-run" : "skipped-invalid";
    if (validation.ok && !dryRun) {
      const result = await commitInputFile({
        requester: getOctokitRequester(),
        owner,
        repo,
        branch: env.GITHUB_BRANCH,
        inputsPath: config.dashboard.inputs_path,
        week,
        filename,
        content: markdown,
      });
      committed = result.committed;
      reason = result.reason;
      console.log(`[agent] ${filename} → ${result.path} (${result.reason})`);
    }

    files.push({
      filename,
      committed,
      reason,
      validation_errors: validation.errors,
      validation_warnings: validation.warnings,
      usage,
    });
  }

  if (files.length === 0) {
    console.log("[agent] no producer yielded signal — nothing to do. Exiting cleanly.");
    return { week, files };
  }

  await appendRunLog("data/runs.jsonl", {
    week,
    signals_ingested: files.length,
    files,
  });

  const cost = files.reduce((s, f) => s + f.usage.cost_estimate_usd, 0);
  console.log(
    `[agent] done files=${files.length} committed=${files.filter((f) => f.committed).length} cost=$${cost.toFixed(4)}`,
  );
  return { week, files };
}

const isDirectInvocation = process.argv[1]?.endsWith("orchestrator.ts");
if (isDirectInvocation) {
  runOrchestrator().catch((err: unknown) => {
    console.error("[agent] FAILED", err);
    process.exitCode = 1;
  });
}
