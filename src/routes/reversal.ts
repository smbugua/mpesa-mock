import { Hono } from "hono";
import type { AppContext } from "../server.js";
import { isValidToken, parseBearerToken } from "../core/auth.js";
import { reversalSchema } from "../schemas/index.js";
import { generateConversationID, generateOriginatorConversationID } from "../core/id-generator.js";
import type { ResultCallbackBody } from "../types/daraja.js";

export function reversalRoute(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  app.post("/mpesa/reversal/v1/request", async (c) => {
    const token = parseBearerToken(c.req.header("authorization"));
    if (!token || !isValidToken(token)) {
      return c.json({ errorCode: "404.001.03", errorMessage: "Invalid Access Token" }, 401);
    }
    const raw = await c.req.json().catch(() => null);
    const parsed = reversalSchema.safeParse(raw);
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
        TransactionID: body.TransactionID,
        ResultParameters: {
          ResultParameter: [
            { Key: "DebitAccountBalance", Value: "Working Account|KES|1000000.00|1000000.00|0.00|0.00" },
            { Key: "Amount", Value: body.Amount },
            { Key: "TransCompletedTime", Value: new Date().toISOString() },
            { Key: "OriginalTransactionID", Value: body.TransactionID },
            { Key: "Charge", Value: 0 },
            { Key: "CreditPartyPublicName", Value: `${body.ReceiverParty} - Test Recipient` },
            { Key: "DebitPartyPublicName", Value: "Test Merchant" },
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
