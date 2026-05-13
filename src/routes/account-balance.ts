import { Hono } from "hono";
import type { AppContext } from "../server.js";
import { isValidToken, parseBearerToken } from "../core/auth.js";
import { accountBalanceSchema } from "../schemas/index.js";
import { generateConversationID, generateOriginatorConversationID } from "../core/id-generator.js";
import type { ResultCallbackBody } from "../types/daraja.js";

export function accountBalanceRoute(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  app.post("/mpesa/accountbalance/v1/query", async (c) => {
    const token = parseBearerToken(c.req.header("authorization"));
    if (!token || !isValidToken(token)) {
      return c.json({ errorCode: "404.001.03", errorMessage: "Invalid Access Token" }, 401);
    }
    const raw = await c.req.json().catch(() => null);
    const parsed = accountBalanceSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { errorCode: "400.002.05", errorMessage: "Invalid request payload", errors: parsed.error.flatten() },
        400,
      );
    }
    const body = parsed.data;
    const conversationID = generateConversationID();
    const originatorConversationID = generateOriginatorConversationID();

    const callback: ResultCallbackBody = {
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        OriginatorConversationID: originatorConversationID,
        ConversationID: conversationID,
        TransactionID: "BALANCE-QUERY",
        ResultParameters: {
          ResultParameter: [
            { Key: "AccountBalance", Value: "Working Account|KES|1000000.00|1000000.00|0.00|0.00&Float Account|KES|0.00|0.00|0.00|0.00&Utility Account|KES|1000000.00|1000000.00|0.00|0.00&Charges Paid Account|KES|0.00|0.00|0.00|0.00&Organization Settlement Account|KES|0.00|0.00|0.00|0.00" },
            { Key: "BOCompletedTime", Value: new Date().toISOString() },
          ],
        },
        ReferenceData: {
          ReferenceItem: { Key: "QueueTimeoutURL", Value: body.QueueTimeOutURL },
        },
      },
    };

    c.var.dispatcher.schedule(
      {
        id: conversationID,
        url: body.ResultURL,
        body: callback,
        scheduledAt: Date.now() + c.var.config.defaultCallbackDelayMs,
        attempts: 0,
        maxAttempts: c.var.config.webhookRetry.attempts,
        backoffMs: c.var.config.webhookRetry.backoffMs,
      },
      c.var.config.defaultCallbackDelayMs,
    );

    return c.json({
      OriginatorConversationID: originatorConversationID,
      ConversationID: conversationID,
      ResponseCode: "0",
      ResponseDescription: "Accept the service request successfully.",
    });
  });

  return app;
}
