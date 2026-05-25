/**
 * Loads the agent's persistent memory from `memory/`.
 *
 * - MEMORY.md: hand-curated index of memory files. Read for navigation, not embedded.
 * - prompt-rules.md: stable distilled rules. Embedded in the CACHED portion of the system prompt.
 * - lessons.md: append-only journal. The trailing N days are sliced and embedded
 *   AFTER the cached portion (it changes weekly, so caching it would hurt).
 *
 * Lesson entries follow the convention: `## YYYY-MM-DD — title` then bullet content.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface MemoryBundle {
  index: string;
  rules: string;
  /** Full lessons.md contents (use sliceRecentLessons before embedding into the prompt). */
  lessons: string;
}

const MEMORY_DIR = "memory";

export async function loadMemory(dir = MEMORY_DIR): Promise<MemoryBundle> {
  const [index, rules, lessons] = await Promise.all([
    readFile(resolve(dir, "MEMORY.md"), "utf8"),
    readFile(resolve(dir, "prompt-rules.md"), "utf8"),
    readFile(resolve(dir, "lessons.md"), "utf8"),
  ]);
  return { index, rules, lessons };
}

/**
 * Extracts lesson entries from the last `days` days.
 *
 * A lesson entry is delimited by an H2 heading of the form `## YYYY-MM-DD`
 * (anything after the date on that line is the title and is preserved).
 * Returns an empty string if no entries match the window.
 *
 * `today` is injected for testability.
 */
export function sliceRecentLessons(
  lessonsMarkdown: string,
  days: number,
  today: Date = new Date(),
): string {
  const cutoff = new Date(today.getTime() - days * 86_400_000);
  const sections = splitByH2DateHeading(lessonsMarkdown);
  const kept = sections.filter((s) => s.date && s.date >= cutoff);
  if (kept.length === 0) return "";
  return kept.map((s) => s.raw).join("\n").trim();
}

interface LessonSection {
  date: Date | null;
  raw: string;
}

function splitByH2DateHeading(md: string): LessonSection[] {
  const out: LessonSection[] = [];
  const lines = md.split(/\r?\n/);
  let buffer: string[] = [];
  let currentDate: Date | null = null;
  for (const line of lines) {
    const m = /^##\s+(\d{4}-\d{2}-\d{2})(?:\s|$)/.exec(line);
    if (m) {
      if (buffer.length && currentDate) {
        out.push({ date: currentDate, raw: buffer.join("\n") });
      }
      buffer = [line];
      currentDate = parseIsoDateUtc(m[1]!);
    } else if (currentDate) {
      buffer.push(line);
    }
  }
  if (buffer.length && currentDate) {
    out.push({ date: currentDate, raw: buffer.join("\n") });
  }
  return out;
}

function parseIsoDateUtc(yyyyMmDd: string): Date {
  // Force UTC parse — avoid local-timezone surprises in the slice math.
  return new Date(`${yyyyMmDd}T00:00:00Z`);
}
