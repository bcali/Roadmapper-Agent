# Roadmapper Agent

Autonomous nightly synthesis agent for **Operation Money Tree** — Minor Hotels' payments-modernization roadmap.

Every night the agent reads signals from Microsoft Teams transcripts, Outlook emails, Slack channels, and a daily Claude conversation summary, then proposes structured updates to [`bcali/roadmap-dashboard`](https://github.com/bcali/roadmap-dashboard)'s `roadmap.json`.

For two weeks the agent runs in **proposal-only** mode while accuracy is measured. After ≥90% accuracy over ≥20 graded proposals (trailing 14 days), it graduates to auto-commit with a 0.75 confidence floor.

## Status

**Phase 1 — Bootstrap.** GitHub connector + Claude synthesis + audit output. Slack, Outlook, and Teams connectors land in Phases 2–4.

## Stack

- TypeScript end-to-end (Node 22 LTS)
- `@anthropic-ai/sdk` with forced `tool_use` + zod schema for structured output
- Octokit for the GitHub connector
- GitHub Actions cron for scheduling (no host to babysit)
- Vitest for unit tests **and** prompt-regression evals
- Biome for lint + format

## Layout

```
src/agent/       orchestrator, synthesize, prompts, schema, memory
src/connectors/  github (Phase 1); slack/outlook/teams in later phases
src/normalize/   dedupe + trim
src/audit/       output writer + feedback metrics
src/lib/         config, types, clock, cache helpers
memory/          MEMORY.md, lessons.md, prompt-rules.md (agent's persistent memory)
evals/           fixtures + expected outputs + vitest assertions
config/          agent-config.json (model, thresholds, keywords)
.github/workflows/  ci, eval, nightly
```

## Commands

```bash
npm run agent     # run the orchestrator (writes data/outputs/<date>_*.{json,md})
npm run dry-run   # run against a fixture instead of live connectors
npm run eval      # prompt-regression eval suite
npm test          # unit tests
npm run format    # biome format
```

## Implementation plan

See [roadmap-agent-implementation-plan.md](roadmap-agent-implementation-plan.md) for the full original plan, and `.claude/plans/` for the executed bootstrap plan.
