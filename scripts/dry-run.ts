/**
 * Run the agent against a local fixture instead of the live GitHub repo.
 *
 * Usage:
 *   npm run dry-run -- evals/fixtures/blocker-cko-signoff.json
 *
 * The fixture provides {signals, roadmap, kpis, run_date}. Outputs land
 * in data/dry-runs/<basename>/ so they don't pollute data/outputs/ (which
 * the nightly workflow commits to the nightly-outputs branch).
 *
 * Still calls the real Claude API — useful for prompt iteration without
 * hitting GitHub.
 */

import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { writeOutputs } from "../src/audit/logger.ts";
import { loadMemory } from "../src/agent/memory.ts";
import { synthesize } from "../src/agent/synthesize.ts";
import { normalize } from "../src/normalize/normalize.ts";
import type { Signal } from "../src/lib/types.ts";

interface Fixture {
  run_date: string;
  signals: Signal[];
  roadmap: unknown;
  kpis: unknown;
}

async function main(): Promise<void> {
  const fixturePath = process.argv[2];
  if (!fixturePath) {
    console.error("Usage: npm run dry-run -- <path-to-fixture.json>");
    process.exitCode = 2;
    return;
  }

  const fixture = JSON.parse(await readFile(resolve(fixturePath), "utf8")) as Fixture;
  const signals = normalize(fixture.signals);
  const memory = await loadMemory();

  console.log(`[dry-run] fixture=${fixturePath} signals=${signals.length}`);

  const { proposal, usage } = await synthesize({
    runDate: fixture.run_date,
    signals,
    roadmap: fixture.roadmap,
    kpis: fixture.kpis,
    memory,
  });

  const outputDir = join("data/dry-runs", basename(fixturePath, ".json"));
  const { jsonPath, markdownPath } = await writeOutputs({
    runDate: fixture.run_date,
    proposal,
    signals,
    usage,
    outputDir,
    runsLogPath: join(outputDir, "runs.jsonl"),
  });

  console.log(`[dry-run] wrote ${jsonPath}`);
  console.log(`[dry-run] wrote ${markdownPath}`);
  console.log(
    `[dry-run] changes=${proposal.changes.length} unmapped=${proposal.unmapped_signals.length} tokens_in=${usage.input_tokens} tokens_out=${usage.output_tokens}`,
  );
}

main().catch((err: unknown) => {
  console.error("[dry-run] FAILED", err);
  process.exitCode = 1;
});
