import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendRunLog, writeLocalArtifact } from "./logger.ts";

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
  cost_estimate_usd: 0.01,
};

describe("writeLocalArtifact", () => {
  it("writes <dir>/<week>/<filename> and returns the path", async () => {
    const path = await writeLocalArtifact(
      join(tmp, "out"),
      "2026-W22",
      "status.md",
      "# Status\nKPI",
    );
    expect(path).toMatch(/2026-W22[\\/]status\.md$/);
    expect(await readFile(path, "utf8")).toBe("# Status\nKPI");
  });
});

describe("appendRunLog", () => {
  it("appends one JSON line per run", async () => {
    const logPath = join(tmp, "runs.jsonl");
    await appendRunLog(logPath, {
      week: "2026-W22",
      signals_ingested: 1,
      files: [
        {
          filename: "status.md",
          committed: true,
          reason: "updated",
          validation_errors: [],
          validation_warnings: [],
          usage,
        },
      ],
    });
    const line = JSON.parse((await readFile(logPath, "utf8")).trim());
    expect(line.week).toBe("2026-W22");
    expect(line.files[0].committed).toBe(true);
    expect(line.files[0].usage.cost_estimate_usd).toBe(0.01);
    expect(line.logged_at).toBeTruthy();
  });
});
