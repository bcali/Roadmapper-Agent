import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProposedChanges } from "../agent/schema.ts";
import { writeOutputs } from "./logger.ts";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "audit-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const usage = {
  input_tokens: 100,
  output_tokens: 50,
  cache_read_input_tokens: 80,
  cache_creation_input_tokens: 0,
};

const proposal: ProposedChanges = {
  run_date: "2026-05-25",
  changes: [
    {
      epic_id: "ORCH-014",
      change_type: "blocker",
      summary: "CKO clearing-file sign-off blocked",
      source_refs: ["slack:C1:1"],
      confidence: 0.86,
      rationale: "Sehba named the blocker explicitly.",
    },
  ],
  unmapped_signals: [{ ref: "slack:C2:5", reason: "Routine status update." }],
};

describe("writeOutputs", () => {
  it("writes JSON + markdown + appends a runs.jsonl line", async () => {
    const outputDir = join(tmp, "outputs");
    const runsLogPath = join(tmp, "runs.jsonl");
    const { jsonPath, markdownPath } = await writeOutputs({
      runDate: "2026-05-25",
      proposal,
      signals: [],
      usage,
      outputDir,
      runsLogPath,
    });

    const jsonBody = JSON.parse(await readFile(jsonPath, "utf8"));
    expect(jsonBody.changes).toHaveLength(1);

    const md = await readFile(markdownPath, "utf8");
    expect(md).toContain("## 1. [BLOCKER] ORCH-014 — confidence 0.86");
    expect(md).toContain("**Sources:** slack:C1:1");
    expect(md).toContain("Reviewed but not actioned");

    const runsLine = JSON.parse((await readFile(runsLogPath, "utf8")).trim());
    expect(runsLine.changes_proposed).toBe(1);
    expect(runsLine.unmapped_signals).toBe(1);
    expect(runsLine.usage.cache_read_input_tokens).toBe(80);
  });

  it("renders an empty-changes audit gracefully", async () => {
    const outputDir = join(tmp, "outputs");
    const runsLogPath = join(tmp, "runs.jsonl");
    const { markdownPath } = await writeOutputs({
      runDate: "2026-05-25",
      proposal: { run_date: "2026-05-25", changes: [], unmapped_signals: [] },
      signals: [],
      usage,
      outputDir,
      runsLogPath,
    });
    const md = await readFile(markdownPath, "utf8");
    expect(md).toContain("_No proposed changes tonight._");
  });
});
