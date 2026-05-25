# CLAUDE.md — Roadmapper Agent

Context for Claude Code working on this repo.

## What this is

Nightly synthesis agent for **Operation Money Tree** — Minor Hotels' payments-modernization roadmap. Reads signals from Teams transcripts, Outlook, Slack, and a daily Claude summary; emits a structured proposed-changes JSON; after a 2-week 90%-accuracy pilot, graduates to auto-committing roadmap updates to `bcali/roadmap-dashboard`.

## Architecture decisions (locked)

- **TypeScript end-to-end** (Node 22 LTS). No Python.
- **Bare `@anthropic-ai/sdk`** (not the Agent SDK) + forced `tool_use` + zod schema validation. Agent SDK adds ~12s subprocess cold-start that's wasted in a GH Actions batch job.
- **Structured output** via `tool_choice: { type: "tool", name: "emit_proposed_changes" }` with `input_schema` from `z.toJSONSchema(ProposedChangesSchema)`. The API guarantees valid JSON; `safeParse()` in `synthesize.ts` is defense in depth.
- **GitHub Actions cron** at `0 17 * * *` UTC (midnight Bangkok). No host scheduler.
- **Phase 1 connector**: GitHub only. Slack/Outlook/Teams come in Phases 2/3/4.

## Where things live

- [src/agent/orchestrator.ts](src/agent/orchestrator.ts) — entrypoint; `npm run agent`.
- [src/agent/synthesize.ts](src/agent/synthesize.ts) — the Claude call. Load-bearing.
- [src/agent/schema.ts](src/agent/schema.ts) — zod `ProposedChanges`. Contract for everything downstream.
- [src/agent/prompts.ts](src/agent/prompts.ts) — system prompt composition; cache_control placement matters here.
- [src/agent/memory.ts](src/agent/memory.ts) — loads `memory/` files for the prompt.
- [src/connectors/github.ts](src/connectors/github.ts) — Octokit reads from the dashboard repo.
- [evals/](evals/) — prompt regression suite. Assert on structure (change_type, epic_id, confidence floor, source_refs) — NEVER on summary text.
- [memory/](memory/) — agent's persistent memory across runs. `prompt-rules.md` is in the cached prompt prefix; `lessons.md` trailing 30 days is appended uncached.

## Conventions

- Imports: type-only via `import type`; node built-ins via `node:` protocol (biome enforces).
- Tests co-located: `src/foo.ts` → `src/foo.test.ts`. Vitest projects: `unit` (default) and `evals` (live API).
- Output filenames use `runDateString(timezone)` — never `new Date().toISOString()` slicing. The agent's "today" is in Asia/Bangkok by default.
- Inject the Anthropic client and Octokit into testable functions so unit tests don't need network mocks.

## Commands

```bash
npm run agent              # nightly entrypoint (live API + live GitHub)
npm run dry-run -- evals/fixtures/<name>.json   # local fixture, live API
npm run eval               # full eval harness (live API)
npm test                   # unit tests (no API)
npm run typecheck
npm run format
npm run lint
```

## Phase plan

- **Phase 1 (now)**: GitHub connector → claude_summary.md → synthesize → audit output. CI + nightly cron + eval harness wired.
- **Phase 2 (week 2)**: Slack connector + `scripts/feedback-cli.ts` + `appendLesson()` automation.
- **Phase 3 (week 3)**: Outlook via Microsoft Graph.
- **Phase 4 (week 4)**: Teams transcripts (requires application access policy).
- **Phase 5 (post-pilot, after gate clears)**: auto-commit roadmap.json to `bcali/roadmap-dashboard`.

See [roadmap-agent-implementation-plan.md](roadmap-agent-implementation-plan.md) for the full original plan with the senior-dev pushback documented in commit messages.
