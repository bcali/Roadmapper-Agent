import { describe, expect, it } from "vitest";
import { validateStatusMarkdown } from "./validate.ts";

const GOOD = `# Weekly Status Update — 2026-W22

## Source
- Confluence status page, author Brian Clark, 🟡 YELLOW — auth rate dipped, Wave 1 scaling Monday.

## KPI Data Points
- Auth Rate: 62% (target 82%+) — 75% of declines are insufficient funds, not platform.
- Hotels on Stack: 2 / 585 (QASR Monday = 3).

## Workstream Status
- SCALE-030: QASR UAE go-live Monday Feb 24. On track.
- FRAUD-010: waiting on CKO fraud addendum.

## Risks / Blockers
- Auth rate optics risk — Medium — segment decline reasons before reporting to ExCom.
`;

describe("validateStatusMarkdown", () => {
  it("accepts a well-formed status file", () => {
    const r = validateStatusMarkdown(GOOD);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects unfilled template placeholders", () => {
    const withPlaceholder = GOOD.replace("62%", "[value]");
    const r = validateStatusMarkdown(withPlaceholder);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/placeholder/i);
  });

  it("rejects content with no KPI signal", () => {
    // Long enough to clear the length floor; deliberately avoids the words
    // KPI / auth / payment so only the metric-signal rule trips.
    const noKpi = `# Weekly Status Update\n\n## Notes\n\nThis week the team held several discussions and reviewed progress across the program. Owners were assigned and follow-ups scheduled, but no measurable figures were recorded anywhere in this update at all.`;
    const r = validateStatusMarkdown(noKpi);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/KPI/);
  });

  it("rejects too-short output", () => {
    const r = validateStatusMarkdown("# Weekly Status Update\nKPI: none");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/short/i);
  });

  it("warns (not errors) when epic IDs are absent", () => {
    const noEpics = `# Weekly Status Update — 2026-W22\n\n## KPI Data Points\n- Auth Rate: 62% (target 82%+)\n\n## Risks / Blockers\n- Something concerning happened this week that the team should track carefully going forward, but no workstream identifier was attached to any of the items reported here.`;
    const r = validateStatusMarkdown(noEpics);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/epic/i);
  });
});
