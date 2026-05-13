import { describe, it, expect, vi } from "vitest";
import { WebhookDispatcher } from "../src/core/webhook-dispatcher.js";
import { InMemoryStore } from "../src/core/transactions.js";

describe("WebhookDispatcher", () => {
  it("delivers to URL after delay", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const store = new InMemoryStore();
    const d = new WebhookDispatcher({ store, fetchImpl: fetchImpl as any });
    const job = {
      id: "x1",
      url: "http://example.test/cb",
      body: { ok: true },
      scheduledAt: Date.now(),
      attempts: 0,
      maxAttempts: 3,
      backoffMs: 10,
    };
    const fired = new Promise<void>((r) => d.once("delivered", () => r()));
    d.schedule(job, 30);
    await fired;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 and eventually succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) return new Response("err", { status: 500 });
      return new Response("ok", { status: 200 });
    });
    const d = new WebhookDispatcher({ fetchImpl: fetchImpl as any });
    const delivered = new Promise<number>((r) => d.once("delivered", (e: any) => r(e.attempts)));
    d.schedule(
      {
        id: "x2",
        url: "http://example.test/cb",
        body: {},
        scheduledAt: Date.now(),
        attempts: 0,
        maxAttempts: 4,
        backoffMs: 10,
      },
      0,
    );
    const attempts = await delivered;
    expect(attempts).toBe(3);
  });

  it("aborts on 400 (no retries)", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 400 }));
    const d = new WebhookDispatcher({ fetchImpl: fetchImpl as any });
    const failed = new Promise<any>((r) => d.once("failed", (e) => r(e)));
    d.schedule(
      {
        id: "x3",
        url: "http://example.test/cb",
        body: {},
        scheduledAt: Date.now(),
        attempts: 0,
        maxAttempts: 5,
        backoffMs: 5,
      },
      0,
    );
    const ev = await failed;
    expect(ev.attempts).toBe(1);
  });

  it("forced fail-N-times-first eventually succeeds", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const d = new WebhookDispatcher({ fetchImpl: fetchImpl as any });
    const delivered = new Promise<number>((r) => d.once("delivered", (e: any) => r(e.attempts)));
    d.schedule(
      {
        id: "x4",
        url: "http://example.test/cb",
        body: {},
        scheduledAt: Date.now(),
        attempts: 0,
        maxAttempts: 5,
        backoffMs: 5,
        failNTimesFirst: 2,
      },
      0,
    );
    const attempts = await delivered;
    expect(attempts).toBe(3);
  });
});
