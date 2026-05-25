/**
 * Prompt-regression eval harness.
 *
 * Loads every fixture in evals/fixtures/, runs synthesize() against the
 * real Claude API, asserts the result against evals/expected/<name>.json,
 * prints a pass/fail matrix + token cost, and exits non-zero on failure.
 *
 * Cost guardrail: aborts before the next fixture if cumulative input
 * tokens exceed MAX_INPUT_TOKENS_BUDGET (a rough proxy for ~$1 of spend).
 *
 * Used by .github/workflows/eval.yml on PRs that touch src/agent/** or
 * memory/prompt-rules.md or evals/**.
 */

import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadMemory } from "../src/agent/memory.ts";
import { synthesize } from "../src/agent/synthesize.ts";
import { normalize } from "../src/normalize/normalize.ts";
import type { Signal } from "../src/lib/types.ts";
import { assertProposal, type ExpectedFixture } from "./assertions.ts";

const FIXTURES_DIR = "evals/fixtures";
const EXPECTED_DIR = "evals/expected";
const MAX_INPUT_TOKENS_BUDGET = 200_000; // ~ $1 at Opus pricing for input

interface Fixture {
  run_date: string;
  signals: Signal[];
  roadmap: unknown;
  kpis: unknown;
}

interface EvalRun {
  name: string;
  pass: boolean;
  failures: string[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

async function runOne(name: string, memory: Awaited<ReturnType<typeof loadMemory>>): Promise<EvalRun> {
  const fixturePath = join(FIXTURES_DIR, `${name}.json`);
  const expectedPath = join(EXPECTED_DIR, `${name}.json`);
  const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
  const expected = JSON.parse(await readFile(expectedPath, "utf8")) as ExpectedFixture;

  const signals = normalize(fixture.signals);
  const { proposal, usage } = await synthesize({
    runDate: fixture.run_date,
    signals,
    roadmap: fixture.roadmap,
    kpis: fixture.kpis,
    memory,
  });
  const result = assertProposal(proposal, expected);
  return {
    name,
    pass: result.pass,
    failures: result.failures,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
  };
}

async function main(): Promise<void> {
  const entries = await readdir(FIXTURES_DIR);
  const fixtureNames = entries
    .filter((f) => f.endsWith(".json"))
    .map((f) => basename(f, ".json"))
    .sort();

  if (fixtureNames.length === 0) {
    console.error(`[eval] no fixtures found in ${FIXTURES_DIR}`);
    process.exitCode = 2;
    return;
  }

  const memory = await loadMemory();
  const results: EvalRun[] = [];
  let cumulativeInput = 0;

  for (const name of fixtureNames) {
    if (cumulativeInput >= MAX_INPUT_TOKENS_BUDGET) {
      console.error(`[eval] BUDGET EXCEEDED at ${cumulativeInput} input tokens — aborting remaining fixtures`);
      process.exitCode = 1;
      break;
    }
    process.stdout.write(`[eval] ${name}... `);
    try {
      const r = await runOne(name, memory);
      results.push(r);
      cumulativeInput += r.inputTokens;
      console.log(
        `${r.pass ? "PASS" : "FAIL"}  (in=${r.inputTokens} out=${r.outputTokens} cache_read=${r.cacheReadTokens})`,
      );
      for (const f of r.failures) console.log(`    - ${f}`);
    } catch (err) {
      console.log("ERROR");
      console.error(err);
      results.push({ name, pass: false, failures: [String(err)], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const totalIn = results.reduce((s, r) => s + r.inputTokens, 0);
  const totalOut = results.reduce((s, r) => s + r.outputTokens, 0);
  const totalCache = results.reduce((s, r) => s + r.cacheReadTokens, 0);

  console.log("");
  console.log(`[eval] summary: ${passed} pass · ${failed} fail · ${results.length} total`);
  console.log(`[eval] tokens: input=${totalIn} output=${totalOut} cache_read=${totalCache}`);

  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error("[eval] HARNESS FAILED", err);
  process.exitCode = 1;
});
