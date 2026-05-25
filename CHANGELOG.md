# Changelog

Notable milestones for the Roadmapper Agent. Day-to-day changes are in `git log`.

## Unreleased — Phase 1 bootstrap

- TypeScript + Anthropic SDK + Octokit scaffolding
- GitHub connector reading from `bcali/roadmap-dashboard`
- Forced `tool_use` synthesis with zod-validated `ProposedChanges`
- Memory pattern: `memory/{MEMORY.md, lessons.md, prompt-rules.md}`
- Eval harness with one blocker-cko-signoff fixture
- CI on PR + paths-filtered eval workflow + nightly cron workflow
- Renovate for weekly dependency updates
