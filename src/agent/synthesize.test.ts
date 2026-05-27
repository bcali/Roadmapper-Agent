import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { MemoryBundle } from "./memory.ts";
import { extractStatus } from "./synthesize.ts";

const memory: MemoryBundle = { index: "", rules: "", lessons: "" };

function clientReturning(text: string): Anthropic {
  const stream = vi.fn(() => ({
    finalMessage: () =>
      Promise.resolve({
        content: [{ type: "text", text }],
        usage: {
          input_tokens: 500,
          output_tokens: 300,
          cache_read_input_tokens: 400,
          cache_creation_input_tokens: 0,
        },
      }),
  }));
  return { messages: { stream } } as unknown as Anthropic;
}

const roadmap = { epics: [{ id: "SCALE-030", title: "Wave 1 kickoff", status: "in_progress" }] };
const kpis = { auth_rate: 0.62 };

describe("extractStatus", () => {
  it("returns the model's markdown and usage", async () => {
    const md = "# Weekly Status Update — 2026-W22\n\n## KPI Data Points\n- Auth Rate: 62%";
    const result = await extractStatus(
      {
        week: "2026-W22",
        signals: [
          {
            source: "confluence",
            timestamp_utc: "2026-05-27T00:00:00Z",
            author: "confluence-status",
            text: "<h1>Status</h1> auth 62%",
            ref: "confluence:page:42270721",
          },
        ],
        roadmap,
        kpis,
        memory,
      },
      clientReturning(md),
    );
    expect(result.markdown).toContain("# Weekly Status Update");
    expect(result.usage.cache_read_input_tokens).toBe(400);
  });

  it("passes the roadmap snapshot into the call as cached context", async () => {
    const client = clientReturning("# Weekly Status Update — 2026-W22\n## KPI\n- x");
    const streamSpy = client.messages.stream as unknown as ReturnType<typeof vi.fn>;
    await extractStatus({ week: "2026-W22", signals: [], roadmap, kpis, memory }, client);
    const callArgs = streamSpy.mock.calls[0]![0] as {
      system: Array<{ text: string; cache_control?: unknown }>;
    };
    const systemBlocks = callArgs.system;
    const cached = systemBlocks.find((b) => b.cache_control);
    expect(cached?.text).toContain("SCALE-030"); // roadmap epic id reached the cached context
  });
});
