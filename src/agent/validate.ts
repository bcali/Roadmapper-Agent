/**
 * Structural validation for generated weekly input markdown.
 *
 * The agent emits markdown (not a structured object), so validation is
 * string-level — mirroring the dashboard's scripts/process-inputs.ts
 * `validateTemplate()` plus the per-kind section spec. Run BEFORE committing
 * so we never push a file the downstream pipeline would warn on.
 *
 * `errors` block the commit; `warnings` are logged but allowed.
 */

import type { ExtractKind } from "./prompts.ts";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Project epic ID shape, e.g. PAY-010, SCALE-030, OPERA-001, ANA-020. */
export const EPIC_ID_RE = /\b[A-Z]{2,6}-\d{3}\b/;

/** Placeholder tokens that indicate an unfilled template (per process-inputs.ts). */
const PLACEHOLDER_RE = /\[[^\]]*?(YYYY|Name|Date|Subject|value|val|item|count|arrow)[^\]]*?\]/gi;

const MIN_CONTENT_CHARS = 200;

/** Per-kind "must carry at least one of these" signals (hard error if absent). */
const REQUIRED_ANY: Record<ExtractKind, { label: string; re: RegExp }> = {
  status: { label: "KPI / auth-rate", re: /KPI|Payment Success|Auth Rate|payment_success/i },
  emails: { label: "email-summary", re: /Email Summary|Week-at-a-Glance|Action Items|Relates to/i },
  meetings: {
    label: "meeting-summary",
    re: /Meeting Summary|Decisions Made|Decisions Log|Action Items/i,
  },
  notes: {
    label: "team-notes",
    re: /Team Notes|Decisions|Blockers|Action Items|Status Signals/i,
  },
};

export function validate(kind: ExtractKind, md: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = md.trim();

  if (text.length < MIN_CONTENT_CHARS) {
    errors.push(`Too short (${text.length} chars) — likely an empty/failed generation`);
  }

  const placeholders = text.match(PLACEHOLDER_RE) ?? [];
  if (placeholders.length > 0) {
    errors.push(
      `Has ${placeholders.length} unfilled placeholder(s): ${placeholders.slice(0, 3).join(", ")}`,
    );
  }

  if (!/^#\s/m.test(text)) {
    errors.push("No top-level heading");
  }

  const required = REQUIRED_ANY[kind];
  if (!required.re.test(text)) {
    errors.push(`Missing a ${required.label} section expected for a ${kind} file`);
  }

  if (!EPIC_ID_RE.test(text)) {
    warnings.push("No epic IDs (e.g. PAY-010 / SCALE-030) — content not mapped to workstreams");
  }

  return { ok: errors.length === 0, errors, warnings };
}
