import { describe, expect, it, vi } from "vitest";
import { commitInputFile } from "./dashboard-writer.ts";
import type { OctokitRequester } from "./github.ts";

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

/** Requester stub: optional existing file, captures the PUT payload. */
function makeRequester(existing?: { sha: string; content: string }) {
  const put = vi.fn().mockResolvedValue({ data: {} });
  const request = vi.fn((route: string, params: Record<string, unknown>) => {
    if (route.startsWith("GET")) {
      if (!existing) return Promise.reject(Object.assign(new Error("not found"), { status: 404 }));
      return Promise.resolve({
        data: { sha: existing.sha, content: b64(existing.content), encoding: "base64" },
      });
    }
    return put(route, params);
  });
  return { requester: { request } as OctokitRequester, put };
}

const base = {
  owner: "bcali",
  repo: "roadmap-dashboard",
  branch: "main",
  inputsPath: "inputs/weekly",
  week: "2026-W22",
  filename: "status.md",
};

describe("commitInputFile", () => {
  it("creates a new file when none exists (no sha in PUT)", async () => {
    const { requester, put } = makeRequester();
    const r = await commitInputFile({ ...base, requester, content: "# Status\nKPI ok" });
    expect(r).toMatchObject({
      committed: true,
      reason: "created",
      path: "inputs/weekly/2026-W22/status.md",
    });
    const [, params] = put.mock.calls[0]!;
    expect(params.sha).toBeUndefined();
    expect(Buffer.from(params.content as string, "base64").toString("utf8")).toBe(
      "# Status\nKPI ok",
    );
  });

  it("updates an existing file, passing its sha", async () => {
    const { requester, put } = makeRequester({ sha: "abc123", content: "# Old" });
    const r = await commitInputFile({ ...base, requester, content: "# New status" });
    expect(r).toMatchObject({ committed: true, reason: "updated" });
    const [, params] = put.mock.calls[0]!;
    expect(params.sha).toBe("abc123");
  });

  it("is a no-op when content is byte-identical (ignoring trailing whitespace / CRLF)", async () => {
    const { requester, put } = makeRequester({ sha: "abc123", content: "# Status\nbody\n" });
    const r = await commitInputFile({ ...base, requester, content: "# Status\r\nbody" });
    expect(r).toMatchObject({ committed: false, reason: "unchanged" });
    expect(put).not.toHaveBeenCalled();
  });
});
