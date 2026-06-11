import { describe, expect, it, vi } from "vitest";
import { fetchRecentMessages } from "./slack.ts";

const cfg = { token: "xoxb-test" };

function fetchSeq(...responses: unknown[]): typeof fetch {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  return fn as unknown as typeof fetch;
}

const ok = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) });

describe("fetchRecentMessages", () => {
  it("maps human messages to Signals and drops bot/system noise", async () => {
    const history = ok({
      ok: true,
      messages: [
        {
          type: "message",
          user: "U1",
          text: "FRAUD-001 sign-off is blocked on Forter",
          ts: "1707300000.0001",
        },
        {
          type: "message",
          subtype: "channel_join",
          user: "U2",
          text: "joined",
          ts: "1707300100.0001",
        },
        { type: "message", bot_id: "B9", text: "build passed", ts: "1707300200.0001" },
        { type: "message", user: "U3", text: "   ", ts: "1707300300.0001" },
      ],
    });
    const signals = await fetchRecentMessages(
      cfg,
      { channels: ["C123"], sinceIso: "2026-02-01T00:00:00Z" },
      fetchSeq(history),
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      source: "slack",
      author: "U1",
      ref: "slack:C123:1707300000.0001",
    });
    expect(signals[0]!.text).toContain("FRAUD-001");
    // ts → ISO conversion
    expect(signals[0]!.timestamp_utc).toBe(new Date(1707300000.0001 * 1000).toISOString());
  });

  it("applies the keyword filter", async () => {
    const history = ok({
      ok: true,
      messages: [
        { type: "message", user: "U1", text: "lunch plans?", ts: "1707300000.0001" },
        { type: "message", user: "U2", text: "Juspay settlement is fixed", ts: "1707300100.0001" },
      ],
    });
    const signals = await fetchRecentMessages(
      cfg,
      { channels: ["C123"], sinceIso: "2026-02-01T00:00:00Z", keywords: ["juspay", "settlement"] },
      fetchSeq(history),
    );
    expect(signals.map((s) => s.ref)).toEqual(["slack:C123:1707300100.0001"]);
  });

  it("follows pagination cursors across pages", async () => {
    const page1 = ok({
      ok: true,
      messages: [{ type: "message", user: "U1", text: "page one", ts: "1707300000.0001" }],
      response_metadata: { next_cursor: "CURSOR2" },
    });
    const page2 = ok({
      ok: true,
      messages: [{ type: "message", user: "U2", text: "page two", ts: "1707300100.0001" }],
    });
    const signals = await fetchRecentMessages(
      cfg,
      { channels: ["C123"], sinceIso: "2026-02-01T00:00:00Z" },
      fetchSeq(page1, page2),
    );
    expect(signals.map((s) => s.text)).toEqual(["page one", "page two"]);
  });

  it("throws when the Slack API returns ok:false", async () => {
    const err = ok({ ok: false, error: "not_in_channel" });
    await expect(
      fetchRecentMessages(
        cfg,
        { channels: ["C123"], sinceIso: "2026-02-01T00:00:00Z" },
        fetchSeq(err),
      ),
    ).rejects.toThrow(/not_in_channel/);
  });

  it("throws when the token is missing", async () => {
    await expect(fetchRecentMessages({}, { channels: ["C123"], sinceIso: "x" })).rejects.toThrow(
      /Slack/,
    );
  });

  // A leading U+FEFF (BOM) sneaks in when a token is piped into tooling like
  // `gh secret set`; it would make the `Bearer <token>` header an invalid
  // ByteString. The connector must sanitize before building the header.
  it("strips a BOM/whitespace-wrapped token before building the auth header", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(ok({ ok: true, messages: [] }));
    await fetchRecentMessages(
      { token: "﻿xoxb-bomtoken \n" },
      { channels: ["C123"], sinceIso: "2026-02-01T00:00:00Z" },
      fetchSpy as unknown as typeof fetch,
    );
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toBe("Bearer xoxb-bomtoken");
    // sanity: the raw BOM must not survive into the header
    expect(auth).not.toContain("﻿");
  });
});
