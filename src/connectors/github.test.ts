import { describe, expect, it, vi } from "vitest";
import { makeClient } from "./github.ts";

function octokitStub(response: unknown) {
  return {
    request: vi.fn().mockResolvedValue({ data: response }),
  };
}

describe("makeClient", () => {
  it("decodes a base64-encoded text file", async () => {
    const text = "## 2026-05-25\n- Blockers raised: CKO sign-off\n";
    const stub = octokitStub({
      type: "file",
      encoding: "base64",
      content: Buffer.from(text, "utf8").toString("base64"),
    });
    const client = makeClient(stub, "bcali", "roadmap-dashboard", "main");
    await expect(client.fetchTextFile("data/claude_summary.md")).resolves.toBe(text);
    expect(stub.request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/contents/{path}",
      { owner: "bcali", repo: "roadmap-dashboard", path: "data/claude_summary.md", ref: "main" },
    );
  });

  it("parses fetched JSON", async () => {
    const payload = { epics: [{ id: "ORCH-014", status: "in_progress" }] };
    const stub = octokitStub({
      type: "file",
      encoding: "base64",
      content: Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    });
    const client = makeClient(stub, "bcali", "roadmap-dashboard", "main");
    await expect(client.fetchJsonFile("data/roadmap.json")).resolves.toEqual(payload);
  });

  it("rejects non-file responses (e.g. a directory)", async () => {
    const stub = octokitStub({ type: "dir" });
    const client = makeClient(stub, "bcali", "roadmap-dashboard", "main");
    await expect(client.fetchTextFile("data/")).rejects.toThrow(/not a file/);
  });
});
