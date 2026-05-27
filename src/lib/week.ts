/**
 * ISO 8601 week helpers.
 *
 * The dashboard's pipeline keys everything off `inputs/weekly/<YYYY-WXX>/`,
 * computed by `scripts/lib/week.ts` (date-fns getISOWeek/getISOWeekYear).
 * We re-implement the same ISO numbering here (no date-fns dependency) so the
 * agent writes to the exact folder the dashboard expects.
 *
 * ISO rule: week 1 is the week containing the year's first Thursday; the
 * week-year is the year of that week's Thursday. We derive the week from a
 * `YYYY-MM-DD` date string (the agent's timezone-resolved "today" from
 * clock.runDateString) so week boundaries follow the agent's configured TZ.
 */

/** "2026-05-27" → "2026-W22" */
export function isoWeekOf(dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-").map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) throw new Error(`isoWeekOf: invalid date "${dateYmd}"`);
  const date = new Date(Date.UTC(y, m - 1, d));

  // Shift to the Thursday of the current ISO week.
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const thursday = date.getTime();
  const isoYear = date.getUTCFullYear();

  // Jan 4 is always in ISO week 1; find the Thursday of week 1.
  const week1 = new Date(Date.UTC(isoYear, 0, 4));
  const week1DayNum = (week1.getUTCDay() + 6) % 7;
  week1.setUTCDate(week1.getUTCDate() - week1DayNum + 3);

  const week = 1 + Math.round((thursday - week1.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/**
 * The `count` ISO weeks before `week`, newest-first.
 * "2026-W10", 2 → ["2026-W09", "2026-W08"]. Wraps year boundaries.
 */
export function priorWeeks(week: string, count: number): string[] {
  const [yearStr, weekStr] = week.split("-W");
  let year = Number.parseInt(yearStr ?? "", 10);
  let w = Number.parseInt(weekStr ?? "", 10);
  if (!year || !w) throw new Error(`priorWeeks: invalid week "${week}"`);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    w--;
    if (w < 1) {
      year--;
      w = weeksInIsoYear(year);
    }
    out.push(`${year}-W${String(w).padStart(2, "0")}`);
  }
  return out;
}

/** Number of ISO weeks in a year (52 or 53). */
export function weeksInIsoYear(year: number): number {
  // A year has 53 ISO weeks iff Jan 1 is Thursday, or it's a leap year and Jan 1 is Wednesday.
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (jan1 === 4 || (isLeap && jan1 === 3)) return 53;
  return 52;
}
