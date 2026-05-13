import { describe, it, expect } from "vitest";
import { createServer } from "../src/server.js";
import { pickScenario } from "../src/core/failure-injector.js";
import { defaultConfig } from "../src/server.js";

async function startCallbackSink(): Promise<{ url: string; captured: any[]; close: () => Promise<void> }> {
  const { serve } = await import("@hono/node-server");
  const { Hono } = await import("hono");
  const captured: any[] = [];
  const sink = new Hono();
  sink.post("/cb", async (c) => {
    captured.push(await c.req.json().catch(() => ({})));
    return c.json({ ok: true });
  });
  return new Promise((resolveOk) => {
    const server = serve({ fetch: sink.fetch, port: 0 }, (info) => {
      resolveOk({
        url: `http://127.0.0.1:${info.port}/cb`,
        captured,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function getToken(app: any): Promise<string> {
  const res = await app.request("/oauth/v1/generate?grant_type=client_credentials", {
    headers: { Authorization: "Basic " + Buffer.from("test_key:test_secret").toString("base64") },
  });
  return ((await res.json()) as { access_token: string }).access_token;
}

function payload(phone: string, callbackUrl: string): Record<string, unknown> {
  return {
    BusinessShortCode: "174379",
    Password: "x",
    Timestamp: "20260513120000",
    TransactionType: "CustomerPayBillOnline",
    Amount: 10,
    PartyA: phone,
    PartyB: "174379",
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: "T",
    TransactionDesc: "t",
  };
}

describe("failure-injector", () => {
  it("maps each suffix to the correct scenario", () => {
    const cfg = defaultConfig();
    expect(pickScenario("254712345600", cfg)).toBe("success");
    expect(pickScenario("254712345601", cfg)).toBe("user_cancelled");
    expect(pickScenario("254712345602", cfg)).toBe("insufficient_funds");
    expect(pickScenario("254712345603", cfg)).toBe("wrong_pin");
    expect(pickScenario("254712345604", cfg)).toBe("timeout");
    expect(pickScenario("254712345605", cfg)).toBe("callback_retry");
    expect(pickScenario("254712345606", cfg)).toBe("expired");
    expect(pickScenario("254712345607", cfg)).toBe("system_error");
    expect(pickScenario("254712345699", cfg)).toBe("slow");
  });

  it("config overrides take precedence over suffix", () => {
    const cfg = defaultConfig({ scenarios: { "254712345600": "wrong_pin" } });
    expect(pickScenario("254712345600", cfg)).toBe("wrong_pin");
  });
});

describe("stk-push failure modes (e2e)", () => {
  it("delivers user_cancelled callback for phone ending 01", async () => {
    const sink = await startCallbackSink();
    try {
      const { app } = createServer({ quiet: true, config: { defaultCallbackDelayMs: 50 } });
      const token = await getToken(app);
      await app.request("/mpesa/stkpush/v1/processrequest", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload("254712345601", sink.url)),
      });
      await new Promise((r) => setTimeout(r, 500));
      expect(sink.captured.length).toBe(1);
      expect(sink.captured[0].Body.stkCallback.ResultCode).toBe(1032);
      expect(sink.captured[0].Body.stkCallback.CallbackMetadata).toBeUndefined();
    } finally {
      await sink.close();
    }
  });

  it("delivers insufficient_funds callback for phone ending 02", async () => {
    const sink = await startCallbackSink();
    try {
      const { app } = createServer({ quiet: true, config: { defaultCallbackDelayMs: 50 } });
      const token = await getToken(app);
      await app.request("/mpesa/stkpush/v1/processrequest", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload("254712345602", sink.url)),
      });
      await new Promise((r) => setTimeout(r, 500));
      expect(sink.captured[0].Body.stkCallback.ResultCode).toBe(1);
    } finally {
      await sink.close();
    }
  });

  it("phone ending 04 (timeout) never fires a callback", async () => {
    const sink = await startCallbackSink();
    try {
      const { app } = createServer({ quiet: true, config: { defaultCallbackDelayMs: 50 } });
      const token = await getToken(app);
      await app.request("/mpesa/stkpush/v1/processrequest", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload("254712345604", sink.url)),
      });
      await new Promise((r) => setTimeout(r, 500));
      expect(sink.captured.length).toBe(0);
    } finally {
      await sink.close();
    }
  });
});
