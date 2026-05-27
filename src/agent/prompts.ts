/**
 * Prompt composition for the status extractor.
 *
 * Ports the dashboard's prompts/03 output spec, with one deliberate change:
 * the repo's prompt 03 hardcodes a PAY-/LOY-/ANA- epic list that is now
 * stale (the roadmap was restructured into 10 workstreams / 51 epics —
 * ORCH-/SCALE-/OPERA-/FRAUD-/MIT-/DS-/AVC-/LAQ-/FX-/APM-). So instead of a
 * hardcoded list, we instruct the model to map to whatever epic IDs appear
 * in the roadmap.json we pass in. That snapshot is the cached context.
 *
 * Cache layout for analyze():
 *   systemPrompt  = role + output spec + distilled memory rules   (not cached)
 *   cachedContext = roadmap.json + kpis.json snapshot              (cached)
 *   userPrompt    = the week + raw source signals + recent lessons (not cached)
 */

import type { NormalizedSignal } from "../lib/types.ts";
import { type MemoryBundle, sliceRecentLessons } from "./memory.ts";

const BASE_SYSTEM = `You are a program-management analyst for "Operation Money Tree", Minor Hotels' payments-modernization program. You convert raw weekly source material (Confluence status pages, and later Slack/email/meeting notes) into the program's standard weekly STATUS file.

Map everything to the program's CURRENT epics and workstreams. The authoritative epic IDs are in the roadmap snapshot provided in context — use those exact IDs (e.g. ORCH-001, SCALE-030, OPERA-010, FRAUD-010, AVC-010, LAQ-001, APM-020, DS-001, FX-001, MIT-001). Do NOT invent epic IDs or reuse retired ones.

Produce a single Markdown document with these sections, in order:

# Weekly Status Update — <WEEK>

## Source
- Page/source, author, last-modified, overall RAG (🟢 on track / 🟡 at risk / 🔴 blocked) + one-line summary.

## KPI Data Points
- Pull every metric mentioned (auth/payment success rate, avg cost per txn, % hotels on stack, epics complete/in-progress, $ amounts). Preserve exact numbers and any trend arrows.

## Execution Scorecard
- Table of last week's planned items: | Planned Item | Status (Done/Partial/Not Done) | Workstream (epic id) | Notes |
- Completion rate + carry-forwards (flag anything carried 2+ consecutive weeks).

## Workstream Status
- One subsection per affected workstream with its epic id and RAG: what happened, what's next (with owner), blockers/risks.

## Vendor & Contract Status
- Table: | Vendor | Update | Status | Financial Impact |

## Risk Register
- Ranked table: | # | Risk | Severity (Critical/High/Medium/Low) | Workstream | Status (new/unchanged/escalated/resolved) | Mitigation |

## Week-over-Week Delta
- Resolved since last week, new risks, carry-forwards (2+ weeks → escalation), KPI movement, RAG change.

## AI Observations
- 3-5 sharp observations the downstream roadmap analysis should weigh (patterns, single-points-of-failure, optics risks, opportunities).

Hard rules:
- Preserve exact percentages, dollar amounts, dates, and owner names.
- Never invent facts not present in the source material.
- Every status/risk item should carry an epic id from the roadmap snapshot when one applies.
- Output ONLY the Markdown document. No preamble, no code fences, no closing commentary.
- Do NOT leave bracketed [placeholders] — omit a section's rows if there's genuinely nothing to report, but keep the heading.`;

export function buildStatusSystem(memory: MemoryBundle): string {
  const rules = memory.rules.trim();
  if (!rules) return BASE_SYSTEM;
  return `${BASE_SYSTEM}\n\n## Distilled rules from past feedback\n\n${rules}`;
}

/** Stable per-run context (cached): the roadmap + KPI snapshot. */
export function buildStatusCachedContext(roadmap: unknown, kpis: unknown): string {
  return [
    "## Current roadmap snapshot (authoritative epic IDs + statuses)",
    "```json",
    JSON.stringify(roadmap, null, 2),
    "```",
    "",
    "## Current KPIs",
    "```json",
    JSON.stringify(kpis, null, 2),
    "```",
  ].join("\n");
}

export interface StatusUserInput {
  week: string;
  signals: NormalizedSignal[];
  memory: MemoryBundle;
  lessonLookbackDays: number;
  today?: Date;
}

export function buildStatusUserMessage(input: StatusUserInput): string {
  const recentLessons = sliceRecentLessons(
    input.memory.lessons,
    input.lessonLookbackDays,
    input.today,
  );
  const parts: string[] = [
    `Generate the STATUS file for week ${input.week}.`,
    "",
    "### Raw source material",
    "```",
    input.signals.map((s) => `[${s.source}] ${s.ref}\n${s.text}`).join("\n\n---\n\n"),
    "```",
  ];
  if (recentLessons) {
    parts.push(
      "",
      "### Recent lessons (apply these — they came from past corrections)",
      recentLessons,
    );
  }
  parts.push("", "Output the Markdown STATUS document now.");
  return parts.join("\n");
}
