/**
 * The synthesis call — Claude reads tonight's signals + current roadmap and
 * emits a ProposedChanges object by invoking the `emit_proposed_changes`
 * tool.
 *
 * Design notes:
 * - We use bare @anthropic-ai/sdk + forced tool_use rather than the Claude
 *   Agent SDK. The Agent SDK spins a subprocess (~12s cold start) and
 *   includes filesystem/bash tools we don't want in a CI batch job. A single
 *   messages.create call is the right shape here.
 * - tool_choice forces the model to call our tool; the API guarantees a
 *   tool_use block whose `input` matches the JSON Schema we derive from
 *   the zod ProposedChanges schema.
 * - We still safeParse() the result as defense in depth.
 * - The Anthropic client is injected for testability (synthesize() takes
 *   the client; production wires the real one in via getAnthropic()).
 *
 * Cost: stable system blocks are cache_control: ephemeral, so the second
 * and later nightly runs only pay full input price on the volatile suffix.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { loadAgentConfig } from "../lib/config.ts";
import { type MemoryBundle } from "./memory.ts";
import { composeSystemPrompt, renderUserMessage } from "./prompts.ts";
import { ProposedChangesSchema, type ProposedChanges } from "./schema.ts";
import type { NormalizedSignal } from "../lib/types.ts";

export interface SynthesisInput {
  runDate: string;
  signals: NormalizedSignal[];
  roadmap: unknown;
  kpis: unknown;
  memory: MemoryBundle;
}

export interface SynthesisResult {
  proposal: ProposedChanges;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
}

const TOOL_NAME = "emit_proposed_changes";

let cachedAnthropic: Anthropic | undefined;
export function getAnthropic(): Anthropic {
  if (!cachedAnthropic) cachedAnthropic = new Anthropic();
  return cachedAnthropic;
}

function buildTool(): Anthropic.Tool {
  // zod v4 ships native JSON Schema generation. Anthropic's tool input_schema
  // accepts standard JSON Schema; we strip the $schema root key to keep the
  // wire payload small.
  const schema = z.toJSONSchema(ProposedChangesSchema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    name: TOOL_NAME,
    description:
      "Emit tonight's roadmap-change proposals. You MUST call this tool exactly once with valid arguments.",
    input_schema: schema as Anthropic.Tool["input_schema"],
  };
}

export async function synthesize(
  input: SynthesisInput,
  client: Anthropic = getAnthropic(),
): Promise<SynthesisResult> {
  const config = loadAgentConfig();
  const tool = buildTool();
  const system = composeSystemPrompt(input.memory, config.lesson_lookback_days);

  const resp = await client.messages.create({
    model: config.model,
    max_tokens: config.max_tokens,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: renderUserMessage({
          runDate: input.runDate,
          signals: input.signals,
          roadmap: input.roadmap,
          kpis: input.kpis,
        }),
      },
    ],
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error(`Expected a tool_use block but got: ${JSON.stringify(resp.content)}`);
  }
  if (block.name !== TOOL_NAME) {
    throw new Error(`Expected tool_use for ${TOOL_NAME} but got ${block.name}`);
  }

  const parsed = ProposedChangesSchema.safeParse(block.input);
  if (!parsed.success) {
    throw new Error(
      `Tool input failed schema validation: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  return {
    proposal: parsed.data,
    usage: {
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
      cache_read_input_tokens: resp.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: resp.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
