import { describe, expect, it } from "vitest";
import { isoWeekOf, priorWeeks, weeksInIsoYear } from "./week.ts";

describe("isoWeekOf", () => {
  it("computes known ISO weeks", () => {
    expect(isoWeekOf("2026-01-01")).toBe("2026-W01"); // Jan 1 2026 is Thursday → W01
    expect(isoWeekOf("2025-12-29")).toBe("2026-W01"); // Mon of that week belongs to 2026-W01
    expect(isoWeekOf("2026-05-27")).toBe("2026-W22"); // today, per the pilot
    expect(isoWeekOf("2026-02-20")).toBe("2026-W08"); // the real latest status page date
  });

  it("handles year-boundary week-years", () => {
    expect(isoWeekOf("2023-01-01")).toBe("2022-W52"); // Sunday → still 2022
    expect(isoWeekOf("2021-01-01")).toBe("2020-W53"); // Friday → 2020-W53
  });

  it("throws on malformed input", () => {
    expect(() => isoWeekOf("nonsense")).toThrow();
  });
});

describe("priorWeeks", () => {
  it("returns newest-first within a year", () => {
    expect(priorWeeks("2026-W10", 2)).toEqual(["2026-W09", "2026-W08"]);
  });

  it("wraps the year boundary using the prior year's week count", () => {
    expect(priorWeeks("2026-W01", 1)).toEqual(["2025-W52"]); // 2025 has 52 ISO weeks
    expect(priorWeeks("2021-W01", 1)).toEqual(["2020-W53"]); // 2020 has 53
  });
});

describe("weeksInIsoYear", () => {
  it("identifies 53-week years", () => {
    expect(weeksInIsoYear(2020)).toBe(53);
    expect(weeksInIsoYear(2026)).toBe(53); // Jan 1 2026 is Thursday
  });
  it("identifies 52-week years", () => {
    expect(weeksInIsoYear(2025)).toBe(52);
  });
});
