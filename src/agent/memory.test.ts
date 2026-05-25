import { describe, expect, it } from "vitest";
import { sliceRecentLessons } from "./memory.ts";

const SAMPLE = `# Lessons

## 2026-05-24 — Slip false positive on FX-007
- Confidence: 0.82, verdict: dismiss
- Lesson: "capacity tight" alone is routine PM chatter, not a slip.
- Tag: #slip-detection #false-positive

## 2026-05-10 — Missed CKO sign-off blocker
- Confidence: 0.41, verdict: edit (should have been higher)
- Lesson: Explicit "blocked on" language warrants ≥0.7 confidence.
- Tag: #blocker-detection #false-negative

## 2026-03-01 — Old entry
- Lesson: should be sliced out by a 30-day window.
`;

describe("sliceRecentLessons", () => {
  const today = new Date("2026-05-25T12:00:00Z");

  it("keeps entries within the window", () => {
    const out = sliceRecentLessons(SAMPLE, 30, today);
    expect(out).toContain("2026-05-24");
    expect(out).toContain("2026-05-10");
  });

  it("drops entries older than the window", () => {
    const out = sliceRecentLessons(SAMPLE, 30, today);
    expect(out).not.toContain("2026-03-01");
  });

  it("returns empty string when nothing is in the window", () => {
    const out = sliceRecentLessons(SAMPLE, 1, today);
    expect(out).toBe("");
  });

  it("returns empty string for a memory file with no dated entries", () => {
    const out = sliceRecentLessons("# Lessons\n\n<!-- empty -->", 30, today);
    expect(out).toBe("");
  });
});
