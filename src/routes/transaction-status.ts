import { Hono } from "hono";
import type { AppContext } from "../server.js";
import { isValidToken, parseBearerToken } from "../core/auth.js";
import { transactionStatusSchema } from "../schemas/index.js";
import { generateConversationID, generateOriginatorConversationID } from "../core/id-generator.js";
import type { ResultCallbackBody } from "../types/daraja.js";

export function transactionStatusRoute(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  app.post("/mpesa/transactionstatus/v1/query", async (c) => {
    const token = parseBearerToken(c.req.header("authorization"));
    if (!token || !isValidToken(token)) {
      return c.json({ errorCode: "404.001.03", errorMessage: "Invalid Access Token" }, 401);
    }
    const raw = await c.req.json().catch(() => null);
    const parsed = transactionStatusSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { errorCode: "400.002.05", errorMessage: "Invalid request payload", errors: parsed.error.flatten() },
        400,
      );
    }
    const body = parsed.data;
    const conversationID = generateConversationID();
    const originatorConversationID = generateOriginatorConversationID();

    const existing = c.var.store.get(body.TransactionID);

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
            { Key: "ReceiptNo", Value: existing?.mpesaReceiptNumber ?? body.TransactionID },
            { Key: "ConversationID", Value: existing?.conversationID ?? conversationID },
            { Key: "FinalisedTime", Value: new Date().toISOString() },
            { Key: "Amount", Value: existing?.amount ?? 0 },
            { Key: "TransactionStatus", Value: existing?.state === "success" ? "Completed" : "Failed" },
            { Key: "ReasonType", Value: "Salary Payment via API" },
            { Key: "TransactionReason", Value: body.Remarks },
            { Key: "DebitPartyCharges", Value: "" },
            { Key: "DebitAccountType", Value: "Utility Account" },
            { Key: "InitiatedTime", Value: new Date().toISOString() },
            { Key: "OriginatorConversationID", Value: existing?.originatorConversationID ?? originatorConversationID },
            { Key: "CreditPartyName", Value: existing ? `${existing.phoneNumber} - Test Recipient` : "Test Recipient" },
            { Key: "DebitPartyName", Value: existing ? `${existing.shortCode} - Test Merchant` : "Test Merchant" },
          ],
        },
        ReferenceData: {
          ReferenceItem: { Key: "Occasion", Value: body.Occasion ?? "" },
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
