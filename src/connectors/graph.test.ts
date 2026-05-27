import { describe, expect, it, vi } from "vitest";
import { assertGraphConfig, getAppToken, graphGet } from "./graph.ts";

const cfg = { tenantId: "t", clientId: "c", clientSecret: "s", userId: "brian@example.com" };

describe("assertGraphConfig", () => {
  it("throws when a field is missing", () => {
    expect(() => assertGraphConfig({ tenantId: "t" })).toThrow(/clientId|Graph/);
  });
  it("passes when complete", () => {
    expect(() => assertGraphConfig(cfg)).not.toThrow();
  });
});

describe("getAppToken", () => {
  it("posts client_credentials and returns the access_token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "tok123" }),
    }) as unknown as typeof fetch;
    const token = await getAppToken(cfg, fetchImpl);
    expect(token).toBe("tok123");
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toContain("/t/oauth2/v2.0/token");
    expect(String((call[1] as { body: URLSearchParams }).body)).toContain("client_credentials");
  });

  it("throws on a non-OK token response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }) as unknown as typeof fetch;
    await expect(getAppToken(cfg, fetchImpl)).rejects.toThrow(/token request failed/);
  });
});

describe("graphGet", () => {
  it("sends the bearer token and parses JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [1] }),
    }) as unknown as typeof fetch;
    const data = await graphGet<{ value: number[] }>("tok", "/me", fetchImpl);
    expect(data.value).toEqual([1]);
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((call[1] as { headers: Record<string, string> }).headers.Authorization).toBe(
      "Bearer tok",
    );
  });

  it("returns text when accept is text/vtt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("WEBVTT..."),
    }) as unknown as typeof fetch;
    const data = await graphGet<string>("tok", "/x/content", fetchImpl, "text/vtt");
    expect(data).toBe("WEBVTT...");
  });
});
