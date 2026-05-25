# Agent Persistent Memory — Index

This directory is the **agent's** persistent memory across runs (distinct from `CLAUDE.md`, which is Claude Code's project memory).

Every nightly run loads these files and composes them into the system prompt. The order and cache placement matter — see `src/agent/prompts.ts`.

## Files

- **[lessons.md](lessons.md)** — Append-only journal of past false positives, false negatives, and surprises from human feedback. Trailing 30 days are inserted into the prompt **after** the cached portion (since this changes weekly). Each entry has a date, confidence, verdict, signal, lesson, and tags.

- **[prompt-rules.md](prompt-rules.md)** — Distilled stable rules promoted from `lessons.md` once a pattern recurs (≥3 lessons with the same tag). Goes into the **cached** portion of the system prompt for cost savings.

## Conventions

- **lessons.md** is append-only. Never rewrite history. New entries go at the top under a date heading.
- **prompt-rules.md** is hand-edited (or assisted by `scripts/promote-rules.ts`, with manual review). Keep rules short and imperative ("Require an explicit timeline change before classifying as a slip").
- Use tags consistently: `#blocker-detection`, `#slip-detection`, `#scope-change`, `#risk`, `#false-positive`, `#false-negative`, `#confidence-calibration`.
- This is the agent's memory of **what didn't work**. Code patterns, file paths, and architecture belong in code or `CLAUDE.md`, not here.
