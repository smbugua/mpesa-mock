import { Hono } from "hono";
import type { AppContext } from "../server.js";
import { isValidToken, parseBearerToken } from "../core/auth.js";
import { c2bRegisterUrlSchema, c2bSimulateSchema } from "../schemas/index.js";
import {
  generateConversationID,
  generateMpesaReceiptNumber,
  generateOriginatorConversationID,
  generateTransactionDate,
} from "../core/id-generator.js";
import type { TransactionRecord } from "../types/daraja.js";

interface RegisteredUrl {
  shortCode: string;
  confirmationURL: string;
  validationURL: string;
  responseType: "Completed" | "Cancelled";
}

const registry = new Map<string, RegisteredUrl>();

export function c2bRoute(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  app.post("/mpesa/c2b/v1/registerurl", async (c) => {
    const token = parseBearerToken(c.req.header("authorization"));
    if (!token || !isValidToken(token)) {
      return c.json({ errorCode: "404.001.03", errorMessage: "Invalid Access Token" }, 401);
    }
    const raw = await c.req.json().catch(() => null);
    const parsed = c2bRegisterUrlSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { errorCode: "400.002.05", errorMessage: "Invalid request payload", errors: parsed.error.flatten() },
        400,
      );
    }
    registry.set(parsed.data.ShortCode, {
      shortCode: parsed.data.ShortCode,
      confirmationURL: parsed.data.ConfirmationURL,
      validationURL: parsed.data.ValidationURL,
      responseType: parsed.data.ResponseType,
    });
    return c.json({
      OriginatorCoversationID: generateOriginatorConversationID(),
      ResponseCode: "0",
      ResponseDescription: "success",
    });
  });

  app.post("/mpesa/c2b/v1/simulate", async (c) => {
    const token = parseBearerToken(c.req.header("authorization"));
    if (!token || !isValidToken(token)) {
      return c.json({ errorCode: "404.001.03", errorMessage: "Invalid Access Token" }, 401);
    }
    const raw = await c.req.json().catch(() => null);
    const parsed = c2bSimulateSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { errorCode: "400.002.05", errorMessage: "Invalid request payload", errors: parsed.error.flatten() },
        400,
      );
    }
    const result = await runC2BSimulation(c, parsed.data.ShortCode, parsed.data.Amount, parsed.data.Msisdn, parsed.data.BillRefNumber);
    if (result.kind === "no-registration") {
      return c.json(
        { errorCode: "500.001.1001", errorMessage: "No registered URLs found for this shortcode" },
        500,
      );
    }
    return c.json({
      OriginatorCoversationID: result.originatorConversationID,
      ConversationID: result.conversationID,
      ResponseDescription: "Accept the service request successfully.",
    });
  });

  app.post("/__mock__/c2b/trigger", async (c) => {
    const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!raw) {
      return c.json({ error: "invalid body" }, 400);
    }
    const shortCode = String(raw.ShortCode ?? raw.shortCode ?? "");
    const amount = Number(raw.Amount ?? raw.amount ?? 0);
    const msisdn = String(raw.Msisdn ?? raw.msisdn ?? "");
    const billRef = String(raw.BillRefNumber ?? raw.billRefNumber ?? "TEST");
    if (!shortCode || !amount || !msisdn) {
      return c.json({ error: "ShortCode, Amount, Msisdn required" }, 400);
    }
    const result = await runC2BSimulation(c, shortCode, amount, msisdn, billRef);
    return c.json(result, result.kind === "no-registration" ? 404 : 200);
  });

  return app;
}

async function runC2BSimulation(
  c: { var: AppContext["Variables"]; get<K extends keyof AppContext["Variables"]>(k: K): AppContext["Variables"][K] },
  shortCode: string,
  amount: number,
  msisdn: string,
  billRef: string,
): Promise<
  | { kind: "delivered"; originatorConversationID: string; conversationID: string }
  | { kind: "rejected"; originatorConversationID: string; conversationID: string }
  | { kind: "no-registration" }
> {
  const reg = registry.get(shortCode);
  if (!reg) return { kind: "no-registration" };

  const conversationID = generateConversationID();
  const originatorConversationID = generateOriginatorConversationID();
  const receipt = generateMpesaReceiptNumber();
  const transactionDate = generateTransactionDate();

  const txn: TransactionRecord = {
    checkoutRequestID: conversationID,
    merchantRequestID: originatorConversationID,
    conversationID,
    originatorConversationID,
    kind: "c2b",
    amount,
    phoneNumber: msisdn,
    shortCode,
    callbackUrl: reg.confirmationURL,
    state: "pending",
    createdAt: Date.now(),
    callbackAttempts: 0,
    mpesaReceiptNumber: receipt,
  };
  c.var.store.put(txn);

  const callbackPayload = {
    TransactionType: "Pay Bill",
    TransID: receipt,
    TransTime: String(transactionDate),
    TransAmount: String(amount),
    BusinessShortCode: shortCode,
    BillRefNumber: billRef,
    InvoiceNumber: "",
    OrgAccountBalance: "0.00",
    ThirdPartyTransID: "",
    MSISDN: msisdn,
    FirstName: "Test",
    MiddleName: "C2B",
    LastName: "Customer",
  };

  let validationOk = true;
  try {
    const res = await fetch(reg.validationURL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(callbackPayload),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { ResultCode?: string };
      if (body.ResultCode && body.ResultCode !== "0") validationOk = false;
    }
  } catch {
    validationOk = true;
  }

  if (!validationOk) {
    c.var.store.update(conversationID, { state: "user_cancelled", resultCode: 1, resultDesc: "Validation rejected", completedAt: Date.now() });
    return { kind: "rejected", originatorConversationID, conversationID };
  }

  c.var.dispatcher.schedule(
    {
      id: conversationID,
      url: reg.confirmationURL,
      body: callbackPayload,
      scheduledAt: Date.now(),
      attempts: 0,
      maxAttempts: c.var.config.webhookRetry.attempts,
      backoffMs: c.var.config.webhookRetry.backoffMs,
      transactionId: conversationID,
    },
    0,
  );

  c.var.store.update(conversationID, { state: "success", resultCode: 0, resultDesc: "Success", completedAt: Date.now() });
  return { kind: "delivered", originatorConversationID, conversationID };
}

export function clearC2BRegistry(): void {
  registry.clear();
}
