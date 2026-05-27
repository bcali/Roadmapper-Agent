/**
 * Vitest wrapper around the status-extraction eval.
 *
 * Run with: npx vitest run --project evals
 * Requires ANTHROPIC_API_KEY; auto-skips when absent so contributors without
 * API access can still run the unit suite. One test per fixture.
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMemory } from "../src/agent/memory.ts";
import type { ExtractKind } from "../src/agent/prompts.ts";
import { extract } from "../src/agent/synthesize.ts";
import type { Signal } from "../src/lib/types.ts";
import { normalize } from "../src/normalize/normalize.ts";
import { assertMarkdown, type ExpectedStatus } from "./assertions.ts";

const FIXTURES_DIR = "evals/fixtures";
const EXPECTED_DIR = "evals/expected";

const fixtureNames = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => basename(f, ".json"))
  .sort();

const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!hasApiKey)("status evals (live Claude API)", () => {
  for (const name of fixtureNames) {
    it(name, async () => {
      const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf8")) as {
        kind: ExtractKind;
        week: string;
        signals: Signal[];
        roadmap: unknown;
        kpis: unknown;
      };
      const expected = JSON.parse(
        readFileSync(join(EXPECTED_DIR, `${name}.json`), "utf8"),
      ) as ExpectedStatus;
      const memory = await loadMemory();
      const { markdown } = await extract({
        kind: fixture.kind,
        week: fixture.week,
        signals: normalize(fixture.signals),
        roadmap: fixture.roadmap,
        kpis: fixture.kpis,
        memory,
      });
      const result = assertMarkdown(fixture.kind, markdown, expected);
      if (!result.pass)
        throw new Error(`Eval failures:\n${result.failures.map((f) => `  - ${f}`).join("\n")}`);
      expect(result.pass).toBe(true);
    });
  }
});

describe.skipIf(hasApiKey)("status evals (no API key — skipped)", () => {
  it("has fixtures ready to run when a key is present", () => {
    expect(fixtureNames.length).toBeGreaterThan(0);
  });
});
