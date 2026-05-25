/**
 * Zod schema for the agent's structured output.
 *
 * This is the contract — the prompt-cached system prompt instructs Claude to
 * invoke a single tool whose input_schema is derived from this zod definition
 * via zod-to-json-schema. The Anthropic API enforces the JSON shape on the
 * wire; we still safeParse() the result in synthesize.ts as defense in depth.
 *
 * NEW vs the original implementation plan:
 *  - `rationale` — forces the model to explain *why* it fired, which is the
 *    primary input to the morning review (accept/dismiss decision) and to
 *    lessons.md authoring.
 *  - `unmapped_signals` — captures what the agent ignored, with a reason.
 *    Catches the failure mode "Claude saw an obvious blocker but didn't fire
 *    because no epic_id matched" — that becomes a #false-negative lesson.
 */

import { z } from "zod";

export const ChangeTypeSchema = z.enum(["blocker", "slip", "scope", "risk", "status", "new"]);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

export const ChangeSchema = z.object({
  epic_id: z
    .string()
    .nullable()
    .describe("Existing epic ID (e.g. 'ORCH-014'), or null if unmapped/new"),
  change_type: ChangeTypeSchema,
  summary: z.string().min(1).max(500).describe("One-sentence human summary of the change"),
  source_refs: z
    .array(z.string())
    .min(1)
    .describe(
      "Stable refs to source signals (e.g. 'slack:C123:1690000000.0001'). Every change MUST cite at least one.",
    ),
  confidence: z.number().min(0).max(1).describe("0.0-1.0 self-assessed confidence"),
  business_case_delta: z
    .string()
    .nullable()
    .optional()
    .describe("Short business-case/risk impact note, only when signals support it"),
  rationale: z
    .string()
    .min(1)
    .max(800)
    .describe(
      "Brief reasoning chain: which signal(s) → why this change_type → why this confidence",
    ),
});
export type Change = z.infer<typeof ChangeSchema>;

export const UnmappedSignalSchema = z.object({
  ref: z.string(),
  reason: z.string().describe("Why this signal was reviewed but did not produce a change"),
});

export const ProposedChangesSchema = z.object({
  run_date: z.string().describe("YYYY-MM-DD in the agent's configured timezone"),
  changes: z.array(ChangeSchema),
  unmapped_signals: z
    .array(UnmappedSignalSchema)
    .describe("Signals reviewed but intentionally not turned into a change"),
  notes: z
    .string()
    .nullable()
    .optional()
    .describe("Optional run-level notes (e.g. 'no signals after dedup')"),
});
export type ProposedChanges = z.infer<typeof ProposedChangesSchema>;
