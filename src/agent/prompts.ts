/**
 * Prompt composition for the extractors.
 *
 * One registry keyed by ExtractKind so emails / meetings / status share a
 * single synthesis path (and Slack / Claude-conversations slot in later).
 * Each kind's system prompt is ported from the dashboard's manual prompts
 * (01 email, 02 meetings, 03 status) and the committed example files, with
 * one deliberate change everywhere: map to the epic IDs in the live
 * roadmap.json we pass as cached context — never a hardcoded list (the
 * scheme was restructured to ORCH-/SCALE-/OPERA-/FRAUD-/MIT-/DS-/AVC-/
 * LAQ-/FX-/APM-).
 *
 * Cache layout for analyze():
 *   systemPrompt  = role + per-kind output spec + distilled memory rules (uncached)
 *   cachedContext = roadmap.json + kpis.json snapshot                    (cached)
 *   userPrompt    = week + raw source signals + recent lessons           (uncached)
 */

import type { NormalizedSignal } from "../lib/types.ts";
import { type MemoryBundle, sliceRecentLessons } from "./memory.ts";

export type ExtractKind = "status" | "emails" | "meetings" | "notes";

const COMMON_RULES = `Hard rules:
- Map every item to an epic ID from the roadmap snapshot when one applies. Use those exact IDs; never invent or reuse retired ones.
- Preserve exact percentages, dollar amounts, dates, and owner names.
- Never invent facts not present in the source material.
- Output ONLY the Markdown document — no preamble, no code fences, no closing commentary.
- Do NOT leave bracketed [placeholders]; omit a row/section if there's nothing to report, but keep its heading.`;

const STATUS_SYSTEM = `You are a program-management analyst for "Operation Money Tree", Minor Hotels' payments-modernization program. Convert the raw weekly source material into the program's standard weekly STATUS file.

Produce this Markdown, in order:

# Weekly Status Update — <WEEK>
## Source
- source, author, last-modified, overall RAG (🟢/🟡/🔴) + one-line summary.
## KPI Data Points
- every metric mentioned (auth/payment success rate, avg cost/txn, % hotels on stack, epics complete/in-progress, $ amounts) with trend arrows.
## Execution Scorecard
- | Planned Item | Status (Done/Partial/Not Done) | Workstream (epic id) | Notes | + completion rate + carry-forwards (flag 2+ consecutive).
## Workstream Status
- one subsection per affected workstream (epic id + RAG): what happened, what's next (owner), blockers/risks.
## Vendor & Contract Status
- | Vendor | Update | Status | Financial Impact |
## Risk Register
- | # | Risk | Severity | Workstream | Status (new/unchanged/escalated/resolved) | Mitigation |
## Week-over-Week Delta
- resolved, new risks, carry-forwards (2+ weeks → escalation), KPI movement, RAG change.
## AI Observations
- 3-5 sharp observations for the downstream roadmap analysis.

${COMMON_RULES}`;

const EMAILS_SYSTEM = `You are a program-management analyst for "Operation Money Tree", Minor Hotels' payments-modernization program. Convert the raw email material into the program's standard weekly EMAILS file.

Produce this Markdown, in order:

# Weekly Email Summary — <WEEK>

## High Priority
For each high-priority email/thread (blockers, decisions needed, escalations):
### Email: <subject>
**From:** <name> | **To:** <name> | **Date:** <date>
**Relates to:** <epic id(s)>
**Key Points:**
- ...
**Action Items:**
- <action> — <owner> — <deadline>
**Risk Signal:** 🔴/🟡/none — one-line assessment.

## Standard Priority
(same per-email structure for normal-priority threads)

## FYI / Informational
- short bullets for informational items, each with its epic id.

## Week-at-a-Glance
| Metric | Value |
|---|---|
| Roadmap-relevant emails | <n> |
| Action required (yours) | <n> |
| Waiting on others | <n> |
| Decisions made | <n> |

**Key Themes:** 2-4 bullets.
**Open Threads Requiring Follow-Up:** bullets (blocker/committed/waiting).

${COMMON_RULES}`;

const MEETINGS_SYSTEM = `You are a program-management analyst for "Operation Money Tree", Minor Hotels' payments-modernization program. Convert the raw meeting transcripts/recaps into the program's standard weekly MEETINGS file. Transcripts are noisy — extract only roadmap signal (decisions, status changes, blockers, timeline shifts, technical findings, action items).

Produce this Markdown, in order:

# Weekly Meeting Summary — <WEEK>

## Meeting: <name>
**Date:** <date> | **Duration:** <if known> | **Attendees:** <names>
**Relates to:** <epic id(s)>
### Key Discussion Points
- **<topic>** (<epic id>): ...
### Decisions Made
| Decision | Who | Impact |
|---|---|---|
### Status Updates
| Workstream | Update | Impact |
|---|---|---|
### Action Items
- [ ] <action> — <owner> — <due>
### Roadmap Impact
- timeline changes, new risks, dependencies uncovered, scope changes; flag contradictions with the roadmap snapshot explicitly.
### Notable Quotes
> "<quote>" — <speaker>

(repeat per meeting)

## Cross-Meeting Themes
- recurring themes/blockers across meetings.
## Decisions Log
| Decision | Meeting | Who | Workstream |
|---|---|---|---|

${COMMON_RULES}`;

const NOTES_SYSTEM = `You are a program-management analyst for "Operation Money Tree", Minor Hotels' payments-modernization program. Convert raw Slack chatter from the team's tracked channels into the program's weekly NOTES file. Chat is noisy and informal — extract only roadmap signal (decisions, blockers, status changes, timeline shifts, action items, risks). Ignore banter, logistics, and tooling/CI noise. Threads referenced by author IDs (e.g. U0123) are fine to attribute as-is.

Produce this Markdown, in order:

# Weekly Team Notes — <WEEK>

## Source
- channels covered, message count, date range, overall RAG (🟢/🟡/🔴) + one-line summary.

## Decisions
| Decision | Channel | Who | Workstream (epic id) |
|---|---|---|---|

## Blockers & Risks
- **<blocker/risk>** (<epic id>) — owner, severity 🔴/🟡, status (new/unchanged/escalated/resolved).

## Status Signals
- per-workstream status change surfaced in chat (<epic id>): what changed.

## Action Items
- [ ] <action> — <owner> — <due/none>

## Notable Threads
- short summary of an important discussion, with epic id + channel.

## Themes
- 2-4 recurring themes/blockers across the channels.

${COMMON_RULES}`;

const SYSTEM_PROMPTS: Record<ExtractKind, string> = {
  status: STATUS_SYSTEM,
  emails: EMAILS_SYSTEM,
  meetings: MEETINGS_SYSTEM,
  notes: NOTES_SYSTEM,
};

export function filenameFor(kind: ExtractKind): string {
  return `${kind}.md`;
}

export function buildSystem(kind: ExtractKind, memory: MemoryBundle): string {
  const base = SYSTEM_PROMPTS[kind];
  const rules = memory.rules.trim();
  return rules ? `${base}\n\n## Distilled rules from past feedback\n\n${rules}` : base;
}

/** Stable per-run context (cached): the roadmap + KPI snapshot. */
export function buildCachedContext(roadmap: unknown, kpis: unknown): string {
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

export interface UserMessageInput {
  kind: ExtractKind;
  week: string;
  signals: NormalizedSignal[];
  memory: MemoryBundle;
  lessonLookbackDays: number;
  today?: Date;
}

export function buildUserMessage(input: UserMessageInput): string {
  const recentLessons = sliceRecentLessons(
    input.memory.lessons,
    input.lessonLookbackDays,
    input.today,
  );
  const parts: string[] = [
    `Generate the ${input.kind.toUpperCase()} file for week ${input.week}.`,
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
  parts.push("", `Output the Markdown ${input.kind.toUpperCase()} document now.`);
  return parts.join("\n");
}
