import { describe, it, expect, beforeEach } from "vitest";
import { createServer } from "../src/server.js";
import { clearC2BRegistry } from "../src/routes/c2b.js";
import { clearTokens } from "../src/core/auth.js";

async function startSink(reject = false): Promise<{ confirmation: string; validation: string; got: any[]; close: () => Promise<void> }> {
  const { serve } = await import("@hono/node-server");
  const { Hono } = await import("hono");
  const got: any[] = [];
  const sink = new Hono();
  sink.post("/confirmation", async (c) => {
    got.push({ kind: "confirmation", body: await c.req.json() });
    return c.json({ ResultCode: 0 });
  });
  sink.post("/validation", async (c) => {
    got.push({ kind: "validation", body: await c.req.json() });
    return c.json({ ResultCode: reject ? "C2B00012" : "0" });
  });
  return new Promise((resolveOk) => {
    const server = serve({ fetch: sink.fetch, port: 0 }, (info) => {
      const base = `http://127.0.0.1:${info.port}`;
      resolveOk({
        confirmation: `${base}/confirmation`,
        validation: `${base}/validation`,
        got,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function token(app: any): Promise<string> {
  const r = await app.request("/oauth/v1/generate?grant_type=client_credentials", {
    headers: { Authorization: "Basic " + Buffer.from("k:s").toString("base64") },
  });
  return ((await r.json()) as { access_token: string }).access_token;
}

describe("c2b", () => {
  beforeEach(() => {
    clearC2BRegistry();
    clearTokens();
  });

  it("register-url stores URLs and returns success", async () => {
    const { app } = createServer({ quiet: true });
    const t = await token(app);
    const res = await app.request("/mpesa/c2b/v1/registerurl", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
      body: JSON.stringify({
        ShortCode: "600999",
        ResponseType: "Completed",
        ConfirmationURL: "http://example.test/c",
        ValidationURL: "http://example.test/v",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ResponseCode: string };
    expect(body.ResponseCode).toBe("0");
  });

  it("simulate delivers to confirmation URL when validation passes", async () => {
    const sink = await startSink(false);
    try {
      const { app } = createServer({ quiet: true, config: { defaultCallbackDelayMs: 50 } });
      const t = await token(app);
      await app.request("/mpesa/c2b/v1/registerurl", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
        body: JSON.stringify({
          ShortCode: "600999",
          ResponseType: "Completed",
          ConfirmationURL: sink.confirmation,
          ValidationURL: sink.validation,
        }),
      });
      await app.request("/mpesa/c2b/v1/simulate", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
        body: JSON.stringify({
          ShortCode: "600999",
          CommandID: "CustomerPayBillOnline",
          Amount: 100,
          Msisdn: "254712345600",
          BillRefNumber: "INV001",
        }),
      });
      await new Promise((r) => setTimeout(r, 300));
      const kinds = sink.got.map((g) => g.kind);
      expect(kinds).toContain("validation");
      expect(kinds).toContain("confirmation");
    } finally {
      await sink.close();
    }
  });

  it("simulate skips confirmation when validation rejects with C2B00012", async () => {
    const sink = await startSink(true);
    try {
      const { app } = createServer({ quiet: true });
      const t = await token(app);
      await app.request("/mpesa/c2b/v1/registerurl", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
        body: JSON.stringify({
          ShortCode: "600999",
          ResponseType: "Completed",
          ConfirmationURL: sink.confirmation,
          ValidationURL: sink.validation,
        }),
      });
      await app.request("/mpesa/c2b/v1/simulate", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
        body: JSON.stringify({
          ShortCode: "600999",
          CommandID: "CustomerPayBillOnline",
          Amount: 100,
          Msisdn: "254712345600",
          BillRefNumber: "INV001",
        }),
      });
      await new Promise((r) => setTimeout(r, 200));
      const kinds = sink.got.map((g) => g.kind);
      expect(kinds).toContain("validation");
      expect(kinds).not.toContain("confirmation");
    } finally {
      await sink.close();
    }
  });
});
