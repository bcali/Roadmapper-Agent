/**
 * Single source of truth for time.
 *
 * Tests mock `now()`; production code never calls `new Date()` directly.
 * Use `runDateString()` for the date label in output filenames — it follows
 * the agent's configured timezone (default Asia/Bangkok), so an audit run
 * started just before midnight Bangkok always tags itself with the right day.
 */

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function runDateString(timezone: string, clock: Clock = systemClock): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(clock.now());
}

export function hoursAgoIso(hours: number, clock: Clock = systemClock): string {
  return new Date(clock.now().getTime() - hours * 3_600_000).toISOString();
}
