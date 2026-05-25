import { describe, expect, it } from "vitest";
import { ProposedChangesSchema } from "./schema.ts";

describe("ProposedChangesSchema", () => {
  it("accepts a well-formed proposal", () => {
    const result = ProposedChangesSchema.safeParse({
      run_date: "2026-05-25",
      changes: [
        {
          epic_id: "ORCH-014",
          change_type: "blocker",
          summary: "CKO clearing-file sign-off blocked pending your approval",
          source_refs: ["slack:C123:1690000000.0001"],
          confidence: 0.86,
          rationale: "Sehba called out the blocker explicitly in slack message above.",
        },
      ],
      unmapped_signals: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a change with no source_refs", () => {
    const result = ProposedChangesSchema.safeParse({
      run_date: "2026-05-25",
      changes: [
        {
          epic_id: "ORCH-014",
          change_type: "blocker",
          summary: "Made-up blocker",
          source_refs: [],
          confidence: 0.5,
          rationale: "Hallucinated.",
        },
      ],
      unmapped_signals: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence outside [0,1]", () => {
    const result = ProposedChangesSchema.safeParse({
      run_date: "2026-05-25",
      changes: [
        {
          epic_id: null,
          change_type: "new",
          summary: "x",
          source_refs: ["x:1"],
          confidence: 1.5,
          rationale: "x",
        },
      ],
      unmapped_signals: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown change_type", () => {
    const result = ProposedChangesSchema.safeParse({
      run_date: "2026-05-25",
      changes: [
        {
          epic_id: null,
          change_type: "celebration",
          summary: "x",
          source_refs: ["x:1"],
          confidence: 0.5,
          rationale: "x",
        },
      ],
      unmapped_signals: [],
    });
    expect(result.success).toBe(false);
  });
});
