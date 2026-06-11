import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadAgentConfig, loadEnv, resetConfigCacheForTests } from "./config.ts";

describe("loadEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfigCacheForTests();
    for (const k of ["ANTHROPIC_API_KEY", "GITHUB_TOKEN", "GITHUB_REPO", "GITHUB_BRANCH"]) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetConfigCacheForTests();
  });

  it("rejects missing ANTHROPIC_API_KEY", () => {
    process.env.GITHUB_TOKEN = "ghp_x";
    process.env.GITHUB_REPO = "owner/repo";
    expect(() => loadEnv()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("rejects malformed GITHUB_REPO", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.GITHUB_TOKEN = "ghp_x";
    process.env.GITHUB_REPO = "not-a-slug";
    expect(() => loadEnv()).toThrow(/owner\/repo/);
  });

  it("loads a valid env", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.GITHUB_TOKEN = "ghp_x";
    process.env.GITHUB_REPO = "owner/repo";
    const env = loadEnv();
    expect(env.GITHUB_BRANCH).toBe("main");
    expect(env.TIMEZONE).toBe("Asia/Bangkok");
  });

  // GitHub Actions resolves an unset `secrets.FOO` to "" (not absent). Without
  // the opt() preprocess, .email()/.url() on an unset optional secret would
  // fail validation and tank the whole run — which is how prior nightlies
  // crashed on an unset ATLASSIAN_EMAIL.
  it("coerces empty-string optional secrets to undefined (mirrors GitHub Actions)", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.GITHUB_TOKEN = "ghp_x";
    process.env.GITHUB_REPO = "owner/repo";
    process.env.ATLASSIAN_EMAIL = "";
    process.env.ATLASSIAN_API_TOKEN = "";
    process.env.AZURE_TENANT_ID = "";
    process.env.AZURE_CLIENT_ID = "";
    process.env.AZURE_CLIENT_SECRET = "";
    process.env.GRAPH_USER_ID = "";
    process.env.SLACK_BOT_TOKEN = "";
    process.env.SLACK_ALERTS_WEBHOOK = "";
    const env = loadEnv();
    expect(env.ATLASSIAN_EMAIL).toBeUndefined();
    expect(env.ATLASSIAN_API_TOKEN).toBeUndefined();
    expect(env.AZURE_TENANT_ID).toBeUndefined();
    expect(env.AZURE_CLIENT_ID).toBeUndefined();
    expect(env.AZURE_CLIENT_SECRET).toBeUndefined();
    expect(env.GRAPH_USER_ID).toBeUndefined();
    expect(env.SLACK_BOT_TOKEN).toBeUndefined();
    expect(env.SLACK_ALERTS_WEBHOOK).toBeUndefined();
  });

  it("still validates non-empty optional fields", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.GITHUB_TOKEN = "ghp_x";
    process.env.GITHUB_REPO = "owner/repo";
    process.env.ATLASSIAN_EMAIL = "not-an-email";
    expect(() => loadEnv()).toThrow(/ATLASSIAN_EMAIL/);
  });
});

describe("loadAgentConfig", () => {
  beforeEach(() => resetConfigCacheForTests());

  it("loads the committed agent-config.json", () => {
    const cfg = loadAgentConfig();
    expect(cfg.model).toMatch(/claude/);
    expect(cfg.dashboard.inputs_path).toBe("inputs/weekly");
    expect(cfg.confluence.index_page_id).toBeTruthy();
    expect(cfg.lookback_days).toBeGreaterThan(0);
  });
});
