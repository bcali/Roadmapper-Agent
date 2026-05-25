/**
 * Writes per-run outputs to data/outputs/ and appends one line to
 * data/runs.jsonl (operational telemetry: timestamp, signal count, change
 * count, token usage).
 *
 * Two output files per run:
 *  - <runDate>_proposed_changes.json  — machine-readable, validated by zod
 *  - <runDate>_audit_summary.md       — human review surface (~60s scan)
 *
 * Outputs are written to local disk in dev. In CI (nightly workflow) the
 * outputs directory is uploaded as a workflow artifact AND committed to a
 * nightly-outputs branch of this repo.
 */

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProposedChanges } from "../agent/schema.ts";
import type { NormalizedSignal } from "../lib/types.ts";

export interface RunUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface WriteOutputsArgs {
  runDate: string;
  proposal: ProposedChanges;
  signals: NormalizedSignal[];
  usage: RunUsage;
  /** Output directory; defaults to data/outputs. Tests pass a tmp dir. */
  outputDir?: string;
  /** JSONL file for run telemetry; defaults to data/runs.jsonl. */
  runsLogPath?: string;
}

export interface WriteOutputsResult {
  jsonPath: string;
  markdownPath: string;
}

export async function writeOutputs(args: WriteOutputsArgs): Promise<WriteOutputsResult> {
  const outputDir = args.outputDir ?? "data/outputs";
  const runsLogPath = args.runsLogPath ?? "data/runs.jsonl";
  await mkdir(resolve(outputDir), { recursive: true });

  const jsonPath = resolve(outputDir, `${args.runDate}_proposed_changes.json`);
  await writeFile(jsonPath, JSON.stringify(args.proposal, null, 2), "utf8");

  const markdownPath = resolve(outputDir, `${args.runDate}_audit_summary.md`);
  await writeFile(markdownPath, renderAuditMarkdown(args), "utf8");

  await mkdir(resolve(runsLogPath, ".."), { recursive: true });
  await appendFile(
    resolve(runsLogPath),
    `${JSON.stringify({
      logged_at: new Date().toISOString(),
      run_date: args.runDate,
      signals_ingested: args.signals.length,
      changes_proposed: args.proposal.changes.length,
      unmapped_signals: args.proposal.unmapped_signals.length,
      usage: args.usage,
    })}\n`,
    "utf8",
  );

  return { jsonPath, markdownPath };
}

function renderAuditMarkdown(args: WriteOutputsArgs): string {
  const lines: string[] = [];
  lines.push(`# Roadmap Agent — Audit Summary ${args.runDate}`);
  lines.push("");
  lines.push(`**Signals ingested:** ${args.signals.length}  `);
  lines.push(`**Proposed changes:** ${args.proposal.changes.length}  `);
  lines.push(`**Unmapped signals:** ${args.proposal.unmapped_signals.length}`);
  lines.push("");
  lines.push(
    `_Tokens: input ${args.usage.input_tokens} · output ${args.usage.output_tokens} · cache_read ${args.usage.cache_read_input_tokens} · cache_creation ${args.usage.cache_creation_input_tokens}_`,
  );
  lines.push("");

  if (args.proposal.changes.length === 0) {
    lines.push("_No proposed changes tonight._");
  } else {
    args.proposal.changes.forEach((c, i) => {
      lines.push(
        `## ${i + 1}. [${c.change_type.toUpperCase()}] ${c.epic_id ?? "(unmapped)"} — confidence ${c.confidence.toFixed(2)}`,
      );
      lines.push("");
      lines.push(c.summary);
      lines.push("");
      lines.push(`**Why:** ${c.rationale}`);
      if (c.business_case_delta) {
        lines.push("");
        lines.push(`**Business-case impact:** ${c.business_case_delta}`);
      }
      lines.push("");
      lines.push(`**Sources:** ${c.source_refs.join(", ")}`);
      lines.push("");
    });
  }

  if (args.proposal.unmapped_signals.length > 0) {
    lines.push("## Reviewed but not actioned");
    lines.push("");
    for (const u of args.proposal.unmapped_signals) {
      lines.push(`- \`${u.ref}\` — ${u.reason}`);
    }
    lines.push("");
  }

  if (args.proposal.notes) {
    lines.push("## Notes");
    lines.push("");
    lines.push(args.proposal.notes);
    lines.push("");
  }

  return lines.join("\n");
}
