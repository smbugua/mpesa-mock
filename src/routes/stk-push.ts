import { Hono } from "hono";
import type { AppContext } from "../server.js";
import { isValidToken, parseBearerToken } from "../core/auth.js";
import {
  generateCheckoutRequestID,
  generateMerchantRequestID,
  generateMpesaReceiptNumber,
  generateTransactionDate,
} from "../core/id-generator.js";
import { stkPushSchema } from "../schemas/index.js";
import { callbackDelayFor, isFailure, pickScenario } from "../core/failure-injector.js";
import { stateToResultCode, stateToResultDesc } from "../core/transactions.js";
import type { FailureScenario, StkCallbackBody, TransactionRecord, TransactionState } from "../types/daraja.js";

function scenarioToState(s: FailureScenario): TransactionState {
  switch (s) {
    case "success":
    case "callback_retry":
    case "slow":
      return "success";
    case "user_cancelled": return "user_cancelled";
    case "insufficient_funds": return "insufficient_funds";
    case "wrong_pin": return "wrong_pin";
    case "expired": return "expired";
    case "system_error": return "system_error";
    case "timeout": return "timeout";
  }
}

export function stkPushRoute(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  app.post("/mpesa/stkpush/v1/processrequest", async (c) => {
    const token = parseBearerToken(c.req.header("authorization"));
    if (!token || !isValidToken(token)) {
      return c.json({ errorCode: "404.001.03", errorMessage: "Invalid Access Token" }, 401);
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = stkPushSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          requestId: "no-request-id",
          errorCode: "400.002.05",
          errorMessage: "Invalid request payload",
          errors: parsed.error.flatten(),
        },
        400,
      );
    }
    const body = parsed.data;

    const merchantRequestID = generateMerchantRequestID();
    const checkoutRequestID = generateCheckoutRequestID();
    const scenario = pickScenario(body.PhoneNumber, c.var.config);
    const targetState = scenarioToState(scenario);
    const delay = callbackDelayFor(scenario, c.var.config);

    const record: TransactionRecord = {
      checkoutRequestID,
      merchantRequestID,
      kind: "stk",
      amount: body.Amount,
      phoneNumber: body.PhoneNumber,
      shortCode: body.BusinessShortCode,
      callbackUrl: body.CallBackURL,
      state: "pending",
      createdAt: Date.now(),
      callbackAttempts: 0,
    };
    c.var.store.put(record);

    const failNTimesFirst = scenario === "callback_retry" ? 3 : undefined;

    const callbackBody = buildStkCallback({
      merchantRequestID,
      checkoutRequestID,
      state: targetState,
      amount: body.Amount,
      phoneNumber: body.PhoneNumber,
    });

    if (scenario === "timeout") {
      c.var.log?.(`stk-push ${checkoutRequestID}: timeout scenario, no callback will fire`);
    } else {
      c.var.dispatcher.schedule(
        {
          id: checkoutRequestID,
          url: body.CallBackURL,
          body: callbackBody,
          scheduledAt: Date.now() + delay,
          attempts: 0,
          maxAttempts: c.var.config.webhookRetry.attempts + (failNTimesFirst ?? 0),
          backoffMs: c.var.config.webhookRetry.backoffMs,
          transactionId: checkoutRequestID,
          ...(failNTimesFirst !== undefined ? { failNTimesFirst } : {}),
        },
        delay,
      );
    }

    setTimeout(() => {
      const cur = c.var.store.get(checkoutRequestID);
      if (cur && cur.state === "pending") {
        c.var.store.update(checkoutRequestID, {
          state: targetState,
          resultCode: stateToResultCode(targetState),
          resultDesc: stateToResultDesc(targetState),
          completedAt: Date.now(),
          ...(targetState === "success" ? { mpesaReceiptNumber: generateMpesaReceiptNumber() } : {}),
        });
      }
    }, Math.max(0, delay));

    return c.json({
      MerchantRequestID: merchantRequestID,
      CheckoutRequestID: checkoutRequestID,
      ResponseCode: "0",
      ResponseDescription: "Success. Request accepted for processing",
      CustomerMessage: "Success. Request accepted for processing",
    });
  });

  return app;
}

function buildStkCallback(params: {
  merchantRequestID: string;
  checkoutRequestID: string;
  state: TransactionState;
  amount: number;
  phoneNumber: string;
}): StkCallbackBody {
  const resultCode = stateToResultCode(params.state);
  const resultDesc = stateToResultDesc(params.state);
  if (params.state === "success") {
    return {
      Body: {
        stkCallback: {
          MerchantRequestID: params.merchantRequestID,
          CheckoutRequestID: params.checkoutRequestID,
          ResultCode: resultCode,
          ResultDesc: resultDesc,
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: params.amount },
              { Name: "MpesaReceiptNumber", Value: generateMpesaReceiptNumber() },
              { Name: "TransactionDate", Value: generateTransactionDate() },
              { Name: "PhoneNumber", Value: Number(params.phoneNumber) },
            ],
          },
        },
      },
    };
  }
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: params.merchantRequestID,
        CheckoutRequestID: params.checkoutRequestID,
        ResultCode: resultCode,
        ResultDesc: resultDesc,
      },
    },
  };
}
