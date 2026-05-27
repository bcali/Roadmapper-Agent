# CLAUDE.md — Roadmapper Agent

Context for Claude Code working on this repo.

## What this is

An **input-authoring service** for **Operation Money Tree** — Minor Hotels' payments-modernization program. It automates what Brian currently does by hand (running Microsoft Copilot prompts to write weekly status notes): it pulls raw signal from sources, synthesizes the program's standard weekly input files, and commits them to `bcali/roadmap-dashboard` under `inputs/weekly/<ISO-week>/`. The dashboard's existing pipeline (`process-inputs.yml` → `ai-analyze.yml` → `apply-recommendations.yml`) takes over from the `inputs/**` push.

It does **not** propose roadmap changes — that's already done by `scripts/analyze.ts` in the dashboard repo. This agent feeds the front of that pipeline. See the dashboard's `prompts/01-04` (the manual extraction prompts we're automating) and `docs/AGENTS.md`.

## Architecture decisions (locked)

- **TypeScript end-to-end** (Node 22 LTS). No Python.
- **Bare `@anthropic-ai/sdk`** via `src/lib/anthropic.ts` (`analyze()`): model selection, prompt caching on the roadmap snapshot, extended thinking, retry on 429/529, cost estimation. Ported from the dashboard's `scripts/lib/anthropic.ts`.
- **Output is Markdown**, not a structured object — matching the manual Copilot prompts and how the downstream `analyze.ts` consumes the files. Structure is enforced by `src/agent/validate.ts` (mirrors the dashboard's `process-inputs.ts` checks) before any commit.
- **Default model Sonnet 4.6** (`claude-sonnet-4-6`) for high-volume extraction; `escalation_model` (Opus 4.7) is a config knob.
- **GitHub Actions cron** daily at `0 17 * * *` UTC (midnight Bangkok). No-op when source signal is unchanged (the dashboard-writer compares content and skips identical commits).
- **Commits to the dashboard via the GitHub API** (`src/connectors/dashboard-writer.ts`), using a PAT with `contents:write` on `bcali/roadmap-dashboard`. The agent never commits to its own repo at runtime.
- **Epic IDs are dynamic**: the current scheme is `ORCH-/SCALE-/OPERA-/FRAUD-/MIT-/DS-/AVC-/LAQ-/FX-/APM-` (10 workstreams / 51 epics). Never hardcode — the synthesis prompt maps to whatever IDs are in the live `roadmap.json` it loads.

## Where things live

- [src/agent/orchestrator.ts](src/agent/orchestrator.ts) — entrypoint; `npm run agent`. week → pull → extract → validate → commit → no-op.
- [src/agent/synthesize.ts](src/agent/synthesize.ts) — `extractStatus()`. Load-bearing.
- [src/agent/prompts.ts](src/agent/prompts.ts) — status prompt (ported from the dashboard's prompt 03); cached vs uncached context split.
- [src/agent/validate.ts](src/agent/validate.ts) — markdown structure checks; gate before committing.
- [src/agent/memory.ts](src/agent/memory.ts) — loads `memory/` files into the prompt.
- [src/lib/anthropic.ts](src/lib/anthropic.ts) — the Claude call wrapper.
- [src/lib/week.ts](src/lib/week.ts) — ISO week (`2026-W22`), matches the dashboard's folder convention.
- [src/connectors/confluence.ts](src/connectors/confluence.ts) — Phase A source (Atlassian REST v2).
- [src/connectors/dashboard-writer.ts](src/connectors/dashboard-writer.ts) — commits input files to the dashboard.
- [src/connectors/github.ts](src/connectors/github.ts) — reads roadmap/kpis; exposes the authenticated requester.
- [evals/](evals/) — status-extraction regression. Assert structure + fact preservation (epic IDs, key figures), NEVER exact prose.
- [memory/](memory/) — agent's persistent memory. `prompt-rules.md` is in the cached prompt prefix; `lessons.md` trailing 30 days appended uncached.

## Conventions

- Imports: type-only via `import type`; node built-ins via `node:` (biome enforces).
- Tests co-located: `src/foo.ts` → `src/foo.test.ts`. Vitest projects: `unit` (default, no API) and `evals` (live API).
- Week label from `isoWeekOf(runDateString(timezone))` — never slice `new Date().toISOString()`. Agent's "today" is Asia/Bangkok.
- Inject the Anthropic client / Octokit requester / fetch into testable functions so unit tests need no network.
- `DRY_RUN=true` generates + validates but skips the dashboard commit.

## Commands

```bash
npm run agent      # nightly entrypoint (live Confluence + Claude + dashboard commit)
npm run dry-run -- evals/fixtures/confluence-status-w08.json   # local fixture, live API, no commit
npm run eval       # status-extraction regression (live API)
npm test           # unit tests (no API)
npm run typecheck
npm run format
npm run lint
```

## Phase plan

- **Phase A (now)**: Confluence → `status.md` → commit → dashboard pipeline. CI + nightly cron + eval wired.
- **Phase B**: Slack connector → cross-signal.
- **Phase C**: M365 Outlook → `emails.md` (Azure app + Minor IT admin consent).
- **Phase D**: M365 Teams transcripts → `meetings.md`.
- **Phase E**: `weekly-digest.md` aggregation (dashboard's prompt 04) once ≥2 files are produced.

See [roadmap-agent-implementation-plan.md](roadmap-agent-implementation-plan.md) for the original plan and `.claude/plans/` for the executed pivot plan.
