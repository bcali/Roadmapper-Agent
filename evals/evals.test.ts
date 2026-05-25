/**
 * Vitest wrapper around the eval harness.
 *
 * Run with: npx vitest run --project evals
 *
 * Requires ANTHROPIC_API_KEY in the environment. Skipped automatically
 * when the key is absent so contributors without API access can still
 * run the unit suite.
 *
 * One vitest test per fixture so failures are isolated and the CI
 * report shows exactly which fixture regressed.
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMemory } from "../src/agent/memory.ts";
import { synthesize } from "../src/agent/synthesize.ts";
import type { Signal } from "../src/lib/types.ts";
import { normalize } from "../src/normalize/normalize.ts";
import { assertProposal, type ExpectedFixture } from "./assertions.ts";

const FIXTURES_DIR = "evals/fixtures";
const EXPECTED_DIR = "evals/expected";

const fixtureNames = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => basename(f, ".json"))
  .sort();

const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!hasApiKey)("evals (live Claude API)", () => {
  for (const name of fixtureNames) {
    it(name, async () => {
      const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf8")) as {
        run_date: string;
        signals: Signal[];
        roadmap: unknown;
        kpis: unknown;
      };
      const expected = JSON.parse(
        readFileSync(join(EXPECTED_DIR, `${name}.json`), "utf8"),
      ) as ExpectedFixture;
      const memory = await loadMemory();
      const { proposal } = await synthesize({
        runDate: fixture.run_date,
        signals: normalize(fixture.signals),
        roadmap: fixture.roadmap,
        kpis: fixture.kpis,
        memory,
      });
      const result = assertProposal(proposal, expected);
      if (!result.pass) {
        throw new Error(`Eval failures:\n${result.failures.map((f) => `  - ${f}`).join("\n")}`);
      }
      expect(result.pass).toBe(true);
    });
  }
});

describe.skipIf(hasApiKey)("evals (no API key — skipped)", () => {
  it("would run if ANTHROPIC_API_KEY were set", () => {
    expect(fixtureNames.length).toBeGreaterThan(0);
  });
});
