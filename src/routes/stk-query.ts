import { Hono } from "hono";
import type { AppContext } from "../server.js";
import { isValidToken, parseBearerToken } from "../core/auth.js";
import { stkQuerySchema } from "../schemas/index.js";
import { stateToResultCode, stateToResultDesc } from "../core/transactions.js";

export function stkQueryRoute(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  app.post("/mpesa/stkpushquery/v1/query", async (c) => {
    const token = parseBearerToken(c.req.header("authorization"));
    if (!token || !isValidToken(token)) {
      return c.json({ errorCode: "404.001.03", errorMessage: "Invalid Access Token" }, 401);
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = stkQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { errorCode: "400.002.05", errorMessage: "Invalid request payload", errors: parsed.error.flatten() },
        400,
      );
    }

    const record = c.var.store.get(parsed.data.CheckoutRequestID);
    if (!record) {
      return c.json(
        {
          requestId: "no-request-id",
          errorCode: "500.001.1001",
          errorMessage: "The transaction is being processed",
        },
        500,
      );
    }

    const resultCode = record.resultCode ?? stateToResultCode(record.state);
    return c.json({
      ResponseCode: "0",
      ResponseDescription: "The service request has been accepted successfully",
      MerchantRequestID: record.merchantRequestID,
      CheckoutRequestID: record.checkoutRequestID,
      ResultCode: String(resultCode),
      ResultDesc: record.resultDesc ?? stateToResultDesc(record.state),
    });
  });

  return app;
}
