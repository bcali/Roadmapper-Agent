import { describe, expect, it, vi } from "vitest";
import { fetchRecentTranscripts } from "./teams.ts";

const cfg = { tenantId: "t", clientId: "c", clientSecret: "s", userId: "brian@example.com" };

const tokenResp = { ok: true, json: () => Promise.resolve({ access_token: "tok" }) };
const jsonResp = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) });
const textResp = (body: string) => ({ ok: true, text: () => Promise.resolve(body) });

describe("fetchRecentTranscripts", () => {
  it("walks meetings → transcripts → content into Signals", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResp)
      .mockResolvedValueOnce(
        jsonResp({
          value: [{ id: "M1", subject: "Recon Review", creationDateTime: "2026-05-25T03:00:00Z" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResp({ value: [{ id: "T1", createdDateTime: "2026-05-25T04:30:00Z" }] }),
      )
      .mockResolvedValueOnce(
        textResp("WEBVTT\n\nBrian: settlement bug fixed."),
      ) as unknown as typeof fetch;

    const signals = await fetchRecentTranscripts(
      cfg,
      { sinceIso: "2026-05-20T00:00:00Z" },
      fetchImpl,
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      source: "teams",
      author: "Recon Review",
      ref: "teams:M1:T1",
    });
    expect(signals[0]!.text).toContain("settlement bug fixed");
  });

  it("returns empty when there are no meetings", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResp)
      .mockResolvedValueOnce(jsonResp({ value: [] })) as unknown as typeof fetch;
    expect(
      await fetchRecentTranscripts(cfg, { sinceIso: "2026-05-20T00:00:00Z" }, fetchImpl),
    ).toEqual([]);
  });
});
