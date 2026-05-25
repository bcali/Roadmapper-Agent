/**
 * Domain-aware assertions for the eval harness.
 *
 * We assert ONLY on structural properties (change_type, epic_id, confidence
 * floor, source_refs membership). NEVER on summary text — model paraphrases
 * drift run-to-run and would make the suite flaky.
 *
 * If you find drift in *style* hurting you (e.g. summaries getting too
 * terse), add a separate "Claude-as-judge" check — but only when you
 * actually have the problem.
 */

import type { Change, ProposedChanges } from "../src/agent/schema.ts";

export interface ChangeExpectation {
  epic_id: string | null;
  change_type: Change["change_type"];
  min_confidence: number;
  must_cite_any_of: string[];
}

export interface ExpectedFixture {
  must_contain_change?: ChangeExpectation;
  must_not_fire_on_refs?: string[];
}

export interface AssertionResult {
  pass: boolean;
  failures: string[];
}

export function assertProposal(
  proposal: ProposedChanges,
  expected: ExpectedFixture,
): AssertionResult {
  const failures: string[] = [];

  if (expected.must_contain_change) {
    const spec = expected.must_contain_change;
    const match = proposal.changes.find(
      (c) =>
        c.epic_id === spec.epic_id &&
        c.change_type === spec.change_type &&
        c.confidence >= spec.min_confidence &&
        c.source_refs.some((ref) => spec.must_cite_any_of.includes(ref)),
    );
    if (!match) {
      failures.push(
        `expected a ${spec.change_type} on ${spec.epic_id ?? "null"} with confidence ≥ ${spec.min_confidence} citing one of [${spec.must_cite_any_of.join(", ")}], got changes: ${JSON.stringify(
          proposal.changes.map((c) => ({
            epic_id: c.epic_id,
            change_type: c.change_type,
            confidence: c.confidence,
            source_refs: c.source_refs,
          })),
        )}`,
      );
    }
  }

  if (expected.must_not_fire_on_refs?.length) {
    for (const ref of expected.must_not_fire_on_refs) {
      const wrong = proposal.changes.find((c) => c.source_refs.includes(ref));
      if (wrong) {
        failures.push(
          `expected NO change citing ${ref}, but found ${wrong.change_type} on ${wrong.epic_id ?? "null"}`,
        );
      }
    }
  }

  return { pass: failures.length === 0, failures };
}
