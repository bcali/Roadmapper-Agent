import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import "dotenv/config";

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-", "ANTHROPIC_API_KEY must start with sk-ant-"),
  GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN is required"),
  GITHUB_REPO: z.string().regex(/^[^/]+\/[^/]+$/, "GITHUB_REPO must be in 'owner/repo' form"),
  GITHUB_BRANCH: z.string().default("main"),
  TIMEZONE: z.string().default("Asia/Bangkok"),
  SLACK_ALERTS_WEBHOOK: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

const AgentConfigSchema = z.object({
  model: z.string(),
  max_tokens: z.number().int().positive(),
  lookback_hours: z.number().positive(),
  confidence_floor_auto_apply: z.number().min(0).max(1),
  accuracy_gate_threshold: z.number().min(0).max(1),
  accuracy_gate_min_samples: z.number().int().positive(),
  accuracy_gate_window_days: z.number().int().positive(),
  lesson_lookback_days: z.number().int().positive(),
  keywords: z.array(z.string()),
  dashboard_paths: z.object({
    roadmap: z.string(),
    kpis: z.string(),
    claude_summary: z.string(),
  }),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

let cachedEnv: Env | undefined;
let cachedConfig: AgentConfig | undefined;

export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function loadAgentConfig(path = "config/agent-config.json"): AgentConfig {
  if (cachedConfig) return cachedConfig;
  const raw = readFileSync(resolve(path), "utf8");
  const parsed = AgentConfigSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid agent config at ${path}:\n${issues}`);
  }
  cachedConfig = parsed.data;
  return cachedConfig;
}

export function resetConfigCacheForTests(): void {
  cachedEnv = undefined;
  cachedConfig = undefined;
}
