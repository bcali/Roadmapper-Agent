/**
 * Status-extraction regression harness.
 *
 * For each fixture (a raw source bundle), runs extractStatus() against the
 * real Claude API and asserts the generated status.md against
 * evals/expected/<name>.json (structural validation + required/forbidden
 * substrings). Prints a pass/fail matrix + token cost; exits non-zero on
 * failure. Aborts before the next fixture if cumulative input tokens exceed
 * the budget (~$1).
 *
 * Used by .github/workflows/eval.yml on PRs touching src/agent/**, prompts,
 * or evals/**.
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadMemory } from "../src/agent/memory.ts";
import type { ExtractKind } from "../src/agent/prompts.ts";
import { extract } from "../src/agent/synthesize.ts";
import type { Signal } from "../src/lib/types.ts";
import { normalize } from "../src/normalize/normalize.ts";
import { assertMarkdown, type ExpectedStatus } from "./assertions.ts";

const FIXTURES_DIR = "evals/fixtures";
const EXPECTED_DIR = "evals/expected";
const MAX_INPUT_TOKENS_BUDGET = 200_000; // ~ $1 at Opus pricing

interface Fixture {
  kind: ExtractKind;
  week: string;
  signals: Signal[];
  roadmap: unknown;
  kpis: unknown;
}

async function main(): Promise<void> {
  const names = (await readdir(FIXTURES_DIR))
    .filter((f) => f.endsWith(".json"))
    .map((f) => basename(f, ".json"))
    .sort();

  if (names.length === 0) {
    console.error(`[eval] no fixtures in ${FIXTURES_DIR}`);
    process.exitCode = 2;
    return;
  }

  const memory = await loadMemory();
  let pass = 0;
  let cumulativeInput = 0;
  let totalCost = 0;

  for (const name of names) {
    if (cumulativeInput >= MAX_INPUT_TOKENS_BUDGET) {
      console.error(`[eval] BUDGET EXCEEDED at ${cumulativeInput} input tokens — aborting`);
      process.exitCode = 1;
      break;
    }
    process.stdout.write(`[eval] ${name}... `);
    try {
      const fixture = JSON.parse(
        await readFile(join(FIXTURES_DIR, `${name}.json`), "utf8"),
      ) as Fixture;
      const expected = JSON.parse(
        await readFile(join(EXPECTED_DIR, `${name}.json`), "utf8"),
      ) as ExpectedStatus;
      const { markdown, usage } = await extract({
        kind: fixture.kind,
        week: fixture.week,
        signals: normalize(fixture.signals),
        roadmap: fixture.roadmap,
        kpis: fixture.kpis,
        memory,
      });
      cumulativeInput += usage.input_tokens;
      totalCost += usage.cost_estimate_usd;
      const result = assertMarkdown(fixture.kind, markdown, expected);
      if (result.pass) {
        pass++;
        console.log(
          `PASS (in=${usage.input_tokens} out=${usage.output_tokens} $${usage.cost_estimate_usd.toFixed(4)})`,
        );
      } else {
        console.log("FAIL");
        for (const f of result.failures) console.log(`    - ${f}`);
      }
    } catch (err) {
      console.log("ERROR");
      console.error(err);
    }
  }

  console.log(`\n[eval] ${pass}/${names.length} passed · total cost $${totalCost.toFixed(4)}`);
  if (pass < names.length) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error("[eval] HARNESS FAILED", err);
  process.exitCode = 1;
});
