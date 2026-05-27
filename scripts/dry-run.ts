/**
 * Run the status extractor against a local fixture instead of live Confluence.
 *
 * Usage:
 *   npm run dry-run -- evals/fixtures/confluence-status-w08.json
 *
 * Still calls the real Claude API. Writes the generated status.md to
 * data/dry-runs/<fixture>/ (gitignored) and prints validation + cost — for
 * prompt iteration without hitting Confluence or committing to the dashboard.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { loadMemory } from "../src/agent/memory.ts";
import type { ExtractKind } from "../src/agent/prompts.ts";
import { filenameFor } from "../src/agent/prompts.ts";
import { extract } from "../src/agent/synthesize.ts";
import { validate } from "../src/agent/validate.ts";
import { writeLocalArtifact } from "../src/audit/logger.ts";
import type { Signal } from "../src/lib/types.ts";
import { normalize } from "../src/normalize/normalize.ts";

interface Fixture {
  kind: ExtractKind;
  week: string;
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

  const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
  const memory = await loadMemory();
  console.log(
    `[dry-run] fixture=${fixturePath} kind=${fixture.kind} week=${fixture.week} signals=${fixture.signals.length}`,
  );

  const { markdown, usage } = await extract({
    kind: fixture.kind,
    week: fixture.week,
    signals: normalize(fixture.signals),
    roadmap: fixture.roadmap,
    kpis: fixture.kpis,
    memory,
  });

  const validation = validate(fixture.kind, markdown);
  const outDir = `data/dry-runs/${basename(fixturePath, ".json")}`;
  const path = await writeLocalArtifact(outDir, fixture.week, filenameFor(fixture.kind), markdown);

  console.log(`[dry-run] wrote ${path}`);
  console.log(
    `[dry-run] valid=${validation.ok} errors=${validation.errors.length} warnings=${validation.warnings.length}`,
  );
  for (const e of validation.errors) console.log(`    ERROR: ${e}`);
  for (const w of validation.warnings) console.log(`    warn:  ${w}`);
  console.log(
    `[dry-run] cost=$${usage.cost_estimate_usd.toFixed(4)} in=${usage.input_tokens} out=${usage.output_tokens}`,
  );
}

main().catch((err: unknown) => {
  console.error("[dry-run] FAILED", err);
  process.exitCode = 1;
});
