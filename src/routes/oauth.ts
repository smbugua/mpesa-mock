import { Hono } from "hono";
import { issueToken, isUsingTestCredentials, parseBasicAuth } from "../core/auth.js";
import type { AppContext } from "../server.js";

export function oauthRoute(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  app.get("/oauth/v1/generate", (c) => {
    const grantType = c.req.query("grant_type");
    if (grantType !== "client_credentials") {
      return c.json(
        { requestId: "no-request-id", errorCode: "400.001.01", errorMessage: "Invalid grant_type" },
        400,
      );
    }
    const parsed = parseBasicAuth(c.req.header("authorization"));
    if (!parsed) {
      return c.json(
        { requestId: "no-request-id", errorCode: "401.002.01", errorMessage: "Invalid Authentication passed" },
        401,
      );
    }
    if (isUsingTestCredentials(parsed.key, parsed.secret)) {
      c.get("log")?.("warn: using default test credentials (test_key:test_secret) — fine for mock");
    }
    return c.json(issueToken());
  });

  return app;
}
