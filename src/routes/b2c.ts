import { Hono } from "hono";
import type { AppContext } from "../server.js";
import { isValidToken, parseBearerToken } from "../core/auth.js";
import { b2cSchema } from "../schemas/index.js";
import {
  generateConversationID,
  generateMpesaReceiptNumber,
  generateOriginatorConversationID,
} from "../core/id-generator.js";
import { pickScenario } from "../core/failure-injector.js";
import type { ResultCallbackBody, TransactionRecord } from "../types/daraja.js";

export function b2cRoute(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  app.post("/mpesa/b2c/v1/paymentrequest", async (c) => {
    const token = parseBearerToken(c.req.header("authorization"));
    if (!token || !isValidToken(token)) {
      return c.json({ errorCode: "404.001.03", errorMessage: "Invalid Access Token" }, 401);
    }
    const raw = await c.req.json().catch(() => null);
    const parsed = b2cSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { errorCode: "400.002.05", errorMessage: "Invalid request payload", errors: parsed.error.flatten() },
        400,
      );
    }
    const body = parsed.data;
    const conversationID = generateConversationID();
    const originatorConversationID = generateOriginatorConversationID();
    const scenario = pickScenario(body.PartyB, c.var.config);
    const isSuccess = scenario === "success" || scenario === "slow" || scenario === "callback_retry";

    const record: TransactionRecord = {
      checkoutRequestID: conversationID,
      merchantRequestID: originatorConversationID,
      conversationID,
      originatorConversationID,
      kind: "b2c",
      amount: body.Amount,
      phoneNumber: body.PartyB,
      shortCode: body.PartyA,
      callbackUrl: body.ResultURL,
      state: isSuccess ? "success" : "system_error",
      createdAt: Date.now(),
      callbackAttempts: 0,
      ...(isSuccess ? { mpesaReceiptNumber: generateMpesaReceiptNumber() } : {}),
    };
    c.var.store.put(record);

    const callback: ResultCallbackBody = {
      Result: {
        ResultType: 0,
        ResultCode: isSuccess ? 0 : 2001,
        ResultDesc: isSuccess
          ? "The service request is processed successfully."
          : "The initiator information is invalid.",
        OriginatorConversationID: originatorConversationID,
        ConversationID: conversationID,
        TransactionID: record.mpesaReceiptNumber ?? "N/A",
        ResultParameters: {
          ResultParameter: isSuccess
            ? [
                { Key: "TransactionAmount", Value: body.Amount },
                { Key: "TransactionReceipt", Value: record.mpesaReceiptNumber ?? "" },
                { Key: "B2CRecipientIsRegisteredCustomer", Value: "Y" },
                { Key: "B2CChargesPaidAccountAvailableFunds", Value: 0 },
                { Key: "ReceiverPartyPublicName", Value: `${body.PartyB} - Test Recipient` },
                { Key: "TransactionCompletedDateTime", Value: new Date().toISOString() },
                { Key: "B2CUtilityAccountAvailableFunds", Value: 1000000 },
                { Key: "B2CWorkingAccountAvailableFunds", Value: 1000000 },
              ]
            : [],
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
        transactionId: conversationID,
      },
      c.var.config.defaultCallbackDelayMs,
    );

    return c.json({
      ConversationID: conversationID,
      OriginatorConversationID: originatorConversationID,
      ResponseCode: "0",
      ResponseDescription: "Accept the service request successfully.",
    });
  });

  return app;
}
