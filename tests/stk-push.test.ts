import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer } from "../src/server.js";
import { clearTokens } from "../src/core/auth.js";

interface CapturedCallback {
  url: string;
  body: any;
}

async function startCallbackSink(): Promise<{ url: string; captured: CapturedCallback[]; close: () => Promise<void> }> {
  const { serve } = await import("@hono/node-server");
  const { Hono } = await import("hono");
  const captured: CapturedCallback[] = [];
  const sink = new Hono();
  sink.post("/cb", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    captured.push({ url: "/cb", body });
    return c.json({ ResultCode: 0, ResultDesc: "ok" });
  });
  return new Promise((resolveOk) => {
    const server = serve({ fetch: sink.fetch, port: 0 }, (info) => {
      const url = `http://127.0.0.1:${info.port}/cb`;
      resolveOk({
        url,
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
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

function stkPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    BusinessShortCode: "174379",
    Password: "Mzg5Mzc5",
    Timestamp: "20260513120000",
    TransactionType: "CustomerPayBillOnline",
    Amount: 10,
    PartyA: "254712345600",
    PartyB: "174379",
    PhoneNumber: "254712345600",
    CallBackURL: "http://127.0.0.1:65535/cb",
    AccountReference: "TEST",
    TransactionDesc: "test",
    ...overrides,
  };
}

describe("stk-push end-to-end", () => {
  beforeEach(() => clearTokens());
  afterEach(() => clearTokens());

  it("returns Daraja-shaped sync response", async () => {
    const { app } = createServer({ quiet: true, config: { defaultCallbackDelayMs: 50 } });
    const token = await getToken(app);
    const res = await app.request("/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(stkPayload()),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body.ResponseCode).toBe("0");
    expect(body.ResponseDescription).toBe("Success. Request accepted for processing");
    expect(body.CustomerMessage).toBe("Success. Request accepted for processing");
    expect(body.CheckoutRequestID).toMatch(/^ws_CO_\d{17}$/);
    expect(body.MerchantRequestID).toMatch(/^\d{5}-\d{7,8}-\d$/);
  });

  it("rejects requests without bearer token", async () => {
    const { app } = createServer({ quiet: true });
    const res = await app.request("/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(stkPayload()),
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid bodies", async () => {
    const { app } = createServer({ quiet: true });
    const token = await getToken(app);
    const res = await app.request("/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ BusinessShortCode: "174379" }),
    });
    expect(res.status).toBe(400);
  });

  it("delivers async callback with Daraja-shaped envelope on success (phone ending 00)", async () => {
    const sink = await startCallbackSink();
    try {
      const { app } = createServer({ quiet: true, config: { defaultCallbackDelayMs: 50 } });
      const token = await getToken(app);
      const res = await app.request("/mpesa/stkpush/v1/processrequest", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(stkPayload({ PhoneNumber: "254712345600", CallBackURL: sink.url })),
      });
      expect(res.status).toBe(200);

      await new Promise((r) => setTimeout(r, 500));
      expect(sink.captured.length).toBe(1);
      const cb = sink.captured[0]!.body;
      expect(cb.Body.stkCallback.ResultCode).toBe(0);
      expect(cb.Body.stkCallback.CallbackMetadata.Item).toBeInstanceOf(Array);
      const items = cb.Body.stkCallback.CallbackMetadata.Item as Array<{ Name: string; Value: any }>;
      const names = items.map((i) => i.Name);
      expect(names).toEqual(expect.arrayContaining(["Amount", "MpesaReceiptNumber", "TransactionDate", "PhoneNumber"]));
    } finally {
      await sink.close();
    }
  });
});
