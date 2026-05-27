import { describe, expect, it, vi } from "vitest";
import { extractChildPageIds, fetchLatestStatusSignal } from "./confluence.ts";

// Mirrors the real index page: newest row uses a smartlink wrapper, older
// rows use plain anchor links. The index page's own id (753666) must be excluded.
const INDEX_BODY = `
<table>
<tr><td><custom data-type="smartlink">https://emeapayments.atlassian.net/wiki/spaces/~x/pages/42270721</custom></td></tr>
<tr><td><a href="https://emeapayments.atlassian.net/wiki/spaces/~x/pages/41287681">2/16/2026</a></td></tr>
<tr><td><a href="/wiki/spaces/~x/pages/39321602">2/9/2026</a></td></tr>
</table>
<a href="/wiki/spaces/~x/pages/753666">self</a>
`;

describe("extractChildPageIds", () => {
  it("returns child IDs in document order, newest first, excluding the index page", () => {
    expect(extractChildPageIds(INDEX_BODY, "753666")).toEqual(["42270721", "41287681", "39321602"]);
  });

  it("dedupes repeated links", () => {
    const body = `/pages/100 /pages/100 /pages/200`;
    expect(extractChildPageIds(body, "999")).toEqual(["100", "200"]);
  });

  it("returns empty when no child links exist", () => {
    expect(extractChildPageIds("<p>nothing here</p>", "753666")).toEqual([]);
  });
});

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: "OK", json: () => Promise.resolve(body) } as Response;
}

describe("fetchLatestStatusSignal", () => {
  const cfg = {
    baseUrl: "https://emeapayments.atlassian.net",
    indexPageId: "753666",
    email: "brian@example.com",
    apiToken: "tok",
  };

  it("fetches the index, then the newest child page, as a Signal", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: "753666",
          title: "Status Updates",
          body: { storage: { value: INDEX_BODY } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "42270721",
          title: "Status Update 2/20",
          body: { storage: { value: "<h1>Weekly Status</h1><p>Auth Rate 62%</p>" } },
          version: { createdAt: "2026-02-20T00:00:00Z" },
        }),
      ) as unknown as typeof fetch;

    const signal = await fetchLatestStatusSignal(cfg, fetchImpl);
    expect(signal).not.toBeNull();
    expect(signal?.source).toBe("confluence");
    expect(signal?.ref).toBe("confluence:page:42270721");
    expect(signal?.text).toContain("Auth Rate 62%");
    // First call hits the index page, second the child page.
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0]).toContain("/pages/753666");
    expect(calls[1]![0]).toContain("/pages/42270721");
  });

  it("returns null when the index has no child pages", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: "753666", title: "x", body: { storage: { value: "<p>empty</p>" } } }),
      ) as unknown as typeof fetch;
    expect(await fetchLatestStatusSignal(cfg, fetchImpl)).toBeNull();
  });

  it("throws when credentials are missing", async () => {
    await expect(fetchLatestStatusSignal({ ...cfg, apiToken: "" })).rejects.toThrow(/ATLASSIAN/);
  });
});
