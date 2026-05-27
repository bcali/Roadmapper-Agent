import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import "dotenv/config";

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-", "ANTHROPIC_API_KEY must start with sk-ant-"),
  // Write target: the dashboard repo (agent commits input files here).
  GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN is required"),
  GITHUB_REPO: z.string().regex(/^[^/]+\/[^/]+$/, "GITHUB_REPO must be in 'owner/repo' form"),
  GITHUB_BRANCH: z.string().default("main"),
  // Confluence source (parked). Optional so unit tests / other-source runs don't require them;
  // the connector throws a clear error at call time when they're absent.
  ATLASSIAN_EMAIL: z.string().email().optional(),
  ATLASSIAN_API_TOKEN: z.string().optional(),
  // Microsoft 365 sources (Outlook + Teams). Optional until the Azure app + admin consent land.
  AZURE_TENANT_ID: z.string().optional(),
  AZURE_CLIENT_ID: z.string().optional(),
  AZURE_CLIENT_SECRET: z.string().optional(),
  GRAPH_USER_ID: z.string().optional(),
  TIMEZONE: z.string().default("Asia/Bangkok"),
  SLACK_ALERTS_WEBHOOK: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

const AgentConfigSchema = z.object({
  /** Default extraction model (cheap, high-volume structured work). */
  model: z.string(),
  /** Reserved for hard cases (e.g. status synthesis) if quality needs it. */
  escalation_model: z.string(),
  max_tokens: z.number().int().positive(),
  thinking_budget_tokens: z.number().int().positive(),
  /** How far back each source pulls raw signal. */
  lookback_days: z.number().positive(),
  lesson_lookback_days: z.number().int().positive(),
  /** Keyword prefilter for the Outlook connector (relevance trim before synthesis). */
  email_keywords: z.array(z.string()).default([]),
  dashboard: z.object({
    /** Read for synthesis context. */
    roadmap: z.string(),
    kpis: z.string(),
    /** Where generated weekly input files are committed: <inputs_path>/<week>/<file>.md */
    inputs_path: z.string(),
  }),
  confluence: z.object({
    base_url: z.string().url(),
    /** The status-index page whose table links to each weekly status child page. */
    index_page_id: z.string(),
    space_key: z.string(),
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
