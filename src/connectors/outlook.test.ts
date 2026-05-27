import { describe, expect, it, vi } from "vitest";
import { fetchRecentEmails } from "./outlook.ts";

const cfg = { tenantId: "t", clientId: "c", clientSecret: "s", userId: "brian@example.com" };

function fetchSeq(...responses: unknown[]): typeof fetch {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  return fn as unknown as typeof fetch;
}

const tokenResp = { ok: true, json: () => Promise.resolve({ access_token: "tok" }) };

describe("fetchRecentEmails", () => {
  it("maps messages to Signals", async () => {
    const messages = {
      ok: true,
      json: () =>
        Promise.resolve({
          value: [
            {
              id: "AAA",
              subject: "CKO sign-off blocked",
              from: { emailAddress: { address: "sehba@juspay.in" } },
              receivedDateTime: "2026-05-26T09:00:00Z",
              body: { content: "We are blocked on the clearing file." },
            },
          ],
        }),
    };
    const signals = await fetchRecentEmails(
      cfg,
      { sinceIso: "2026-05-20T00:00:00Z" },
      fetchSeq(tokenResp, messages),
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      source: "outlook",
      author: "sehba@juspay.in",
      ref: "outlook:AAA",
    });
    expect(signals[0]!.text).toContain("CKO sign-off blocked");
  });

  it("applies the keyword filter", async () => {
    const messages = {
      ok: true,
      json: () =>
        Promise.resolve({
          value: [
            {
              id: "1",
              subject: "Lunch?",
              body: { content: "tacos" },
              receivedDateTime: "2026-05-26T09:00:00Z",
            },
            {
              id: "2",
              subject: "Juspay settlement",
              body: { content: "payout fix" },
              receivedDateTime: "2026-05-26T10:00:00Z",
            },
          ],
        }),
    };
    const signals = await fetchRecentEmails(
      cfg,
      { sinceIso: "2026-05-20T00:00:00Z", keywords: ["juspay", "settlement"] },
      fetchSeq(tokenResp, messages),
    );
    expect(signals.map((s) => s.ref)).toEqual(["outlook:2"]);
  });

  it("throws when Graph config is incomplete", async () => {
    await expect(fetchRecentEmails({ tenantId: "t" }, { sinceIso: "x" })).rejects.toThrow(/Graph/);
  });
});
