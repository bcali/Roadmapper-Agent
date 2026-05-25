import { describe, expect, it } from "vitest";
import type { Signal } from "../lib/types.ts";
import { normalize } from "./normalize.ts";

function sig(partial: Partial<Signal> & { text: string; ref: string }): Signal {
  return {
    source: partial.source ?? "slack",
    timestamp_utc: partial.timestamp_utc ?? "2026-05-25T00:00:00Z",
    author: partial.author ?? "U001",
    text: partial.text,
    ref: partial.ref,
  };
}

describe("normalize", () => {
  it("drops empty and whitespace-only entries", () => {
    const out = normalize([
      sig({ text: "", ref: "a" }),
      sig({ text: "   \n  ", ref: "b" }),
      sig({ text: "real content", ref: "c" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.ref).toBe("c");
  });

  it("deduplicates by text, keeping the first occurrence", () => {
    const out = normalize([
      sig({ text: "CKO sign-off blocked", ref: "slack:C1:1" }),
      sig({ text: "CKO sign-off blocked", ref: "slack:C2:2" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.ref).toBe("slack:C1:1");
  });

  it("caps text at 8000 chars", () => {
    const long = "x".repeat(10_000);
    const out = normalize([sig({ text: long, ref: "long" })]);
    expect(out[0]!.text.length).toBe(8000);
  });

  it("preserves input order for surviving entries", () => {
    const out = normalize([
      sig({ text: "a", ref: "1" }),
      sig({ text: "b", ref: "2" }),
      sig({ text: "c", ref: "3" }),
    ]);
    expect(out.map((s) => s.ref)).toEqual(["1", "2", "3"]);
  });
});
