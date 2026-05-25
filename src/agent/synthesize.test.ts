import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { synthesize } from "./synthesize.ts";
import type { MemoryBundle } from "./memory.ts";

const memory: MemoryBundle = { index: "", rules: "", lessons: "" };

function clientReturning(content: unknown[]): Anthropic {
  const create = vi.fn().mockResolvedValue({
    content,
    usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 },
  });
  return { messages: { create } } as unknown as Anthropic;
}

const validToolUse = {
  type: "tool_use",
  name: "emit_proposed_changes",
  input: {
    run_date: "2026-05-25",
    changes: [
      {
        epic_id: "ORCH-014",
        change_type: "blocker",
        summary: "CKO sign-off blocked",
        source_refs: ["slack:C1:1"],
        confidence: 0.86,
        rationale: "Sehba explicitly named the blocker.",
      },
    ],
    unmapped_signals: [],
  },
};

describe("synthesize", () => {
  it("extracts and validates the tool_use input", async () => {
    const client = clientReturning([validToolUse]);
    const result = await synthesize(
      { runDate: "2026-05-25", signals: [], roadmap: {}, kpis: {}, memory },
      client,
    );
    expect(result.proposal.changes).toHaveLength(1);
    expect(result.proposal.changes[0]!.epic_id).toBe("ORCH-014");
    expect(result.usage.cache_read_input_tokens).toBe(3);
  });

  it("throws when the model omits the tool_use", async () => {
    const client = clientReturning([{ type: "text", text: "I refuse." }]);
    await expect(
      synthesize({ runDate: "2026-05-25", signals: [], roadmap: {}, kpis: {}, memory }, client),
    ).rejects.toThrow(/Expected a tool_use/);
  });

  it("throws when the tool input fails schema validation", async () => {
    const bad = {
      ...validToolUse,
      input: {
        ...validToolUse.input,
        changes: [{ ...validToolUse.input.changes[0], confidence: 2.0 }],
      },
    };
    const client = clientReturning([bad]);
    await expect(
      synthesize({ runDate: "2026-05-25", signals: [], roadmap: {}, kpis: {}, memory }, client),
    ).rejects.toThrow(/schema validation/);
  });
});
