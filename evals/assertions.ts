/**
 * Domain-aware assertions for the status-extraction eval.
 *
 * We assert on STRUCTURE and FACT PRESERVATION, never on exact prose:
 *  - the output passes validateStatusMarkdown (same rules the dashboard's
 *    process-inputs.ts applies)
 *  - required substrings are present (epic IDs, key numbers the model must
 *    carry through verbatim from the source)
 *  - forbidden substrings are absent (e.g. retired epic IDs, hallucinated
 *    vendors)
 */

import type { ExtractKind } from "../src/agent/prompts.ts";
import { validate } from "../src/agent/validate.ts";

export interface ExpectedStatus {
  /** Substrings that MUST appear (epic IDs, preserved figures). */
  must_contain: string[];
  /** Substrings that must NOT appear (retired IDs, known hallucinations). */
  must_not_contain?: string[];
}

export interface AssertionResult {
  pass: boolean;
  failures: string[];
}

export function assertMarkdown(
  kind: ExtractKind,
  md: string,
  expected: ExpectedStatus,
): AssertionResult {
  const failures: string[] = [];

  const validation = validate(kind, md);
  if (!validation.ok) {
    failures.push(`failed structural validation: ${validation.errors.join("; ")}`);
  }

  for (const needle of expected.must_contain) {
    if (!md.includes(needle)) failures.push(`missing required substring: "${needle}"`);
  }
  for (const banned of expected.must_not_contain ?? []) {
    if (md.includes(banned)) failures.push(`contains forbidden substring: "${banned}"`);
  }

  return { pass: failures.length === 0, failures };
}
