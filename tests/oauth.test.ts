import { describe, it, expect, beforeEach } from "vitest";
import { createServer } from "../src/server.js";
import { clearTokens } from "../src/core/auth.js";

describe("oauth /oauth/v1/generate", () => {
  beforeEach(() => clearTokens());

  it("returns access_token and stringified expires_in for valid basic auth", async () => {
    const { app } = createServer({ quiet: true });
    const res = await app.request("/oauth/v1/generate?grant_type=client_credentials", {
      headers: { Authorization: "Basic " + Buffer.from("test_key:test_secret").toString("base64") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string; expires_in: string };
    expect(typeof body.access_token).toBe("string");
    expect(body.access_token.length).toBe(32);
    expect(body.expires_in).toBe("3599");
    expect(typeof body.expires_in).toBe("string");
  });

  it("rejects missing authorization header", async () => {
    const { app } = createServer({ quiet: true });
    const res = await app.request("/oauth/v1/generate?grant_type=client_credentials");
    expect(res.status).toBe(401);
  });

  it("rejects invalid grant_type", async () => {
    const { app } = createServer({ quiet: true });
    const res = await app.request("/oauth/v1/generate?grant_type=password", {
      headers: { Authorization: "Basic " + Buffer.from("k:s").toString("base64") },
    });
    expect(res.status).toBe(400);
  });

  it("accepts arbitrary non-empty credentials (mock leniency)", async () => {
    const { app } = createServer({ quiet: true });
    const res = await app.request("/oauth/v1/generate?grant_type=client_credentials", {
      headers: { Authorization: "Basic " + Buffer.from("anykey:anysecret").toString("base64") },
    });
    expect(res.status).toBe(200);
  });
});
