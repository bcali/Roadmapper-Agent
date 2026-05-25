import { beforeEach, afterEach, describe, expect, it } from "vitest";
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
});

describe("loadAgentConfig", () => {
  beforeEach(() => resetConfigCacheForTests());

  it("loads the committed agent-config.json", () => {
    const cfg = loadAgentConfig();
    expect(cfg.confidence_floor_auto_apply).toBeGreaterThan(0);
    expect(cfg.confidence_floor_auto_apply).toBeLessThanOrEqual(1);
    expect(cfg.keywords.length).toBeGreaterThan(0);
  });
});
