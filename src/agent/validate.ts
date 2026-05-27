/**
 * Structural validation for generated weekly input markdown.
 *
 * The agent produces markdown (not a structured object), so validation is
 * string-level — mirroring the dashboard's scripts/process-inputs.ts
 * `validateTemplate()` plus the section spec from prompts/03. We run this
 * BEFORE committing to the dashboard so we never push a file that the
 * downstream pipeline would warn on (unfilled placeholders, missing KPI
 * section, empty template).
 *
 * `errors` block the commit; `warnings` are logged but allowed.
 */

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

export function validateStatusMarkdown(md: string): ValidationResult {
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

  // process-inputs.ts requires a KPI signal in status files.
  if (!/KPI|Payment Success|Auth Rate|payment_success/i.test(text)) {
    errors.push("Missing a KPI / auth-rate section (status files must carry KPI signal)");
  }

  if (!/^#\s/m.test(text)) {
    errors.push("No top-level heading (expected '# Weekly Status Update …')");
  }

  // Soft expectations from the prompt-03 output template.
  if (!/risk/i.test(text)) warnings.push("No Risk/Blocker section found");
  if (!EPIC_ID_RE.test(text)) {
    warnings.push("No epic IDs (e.g. PAY-010 / SCALE-030) — status not mapped to workstreams");
  }

  return { ok: errors.length === 0, errors, warnings };
}
