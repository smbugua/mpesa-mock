import { z } from "zod";

export const stkPushSchema = z.object({
  BusinessShortCode: z.string().min(1),
  Password: z.string().min(1),
  Timestamp: z.string().min(1),
  TransactionType: z.enum(["CustomerPayBillOnline", "CustomerBuyGoodsOnline"]),
  Amount: z.number().int().positive(),
  PartyA: z.string().min(1),
  PartyB: z.string().min(1),
  PhoneNumber: z.string().min(1),
  CallBackURL: z.string().url(),
  AccountReference: z.string().min(1).max(12),
  TransactionDesc: z.string().min(1).max(13),
});

export const stkQuerySchema = z.object({
  BusinessShortCode: z.string().min(1),
  Password: z.string().min(1),
  Timestamp: z.string().min(1),
  CheckoutRequestID: z.string().min(1),
});

export const c2bRegisterUrlSchema = z.object({
  ShortCode: z.string().min(1),
  ResponseType: z.enum(["Completed", "Cancelled"]),
  ConfirmationURL: z.string().url(),
  ValidationURL: z.string().url(),
});

export const c2bSimulateSchema = z.object({
  ShortCode: z.string().min(1),
  CommandID: z.enum(["CustomerPayBillOnline", "CustomerBuyGoodsOnline"]),
  Amount: z.number().int().positive(),
  Msisdn: z.string().min(1),
  BillRefNumber: z.string().min(1),
});

export const b2cSchema = z.object({
  InitiatorName: z.string().min(1),
  SecurityCredential: z.string().min(1),
  CommandID: z.enum(["SalaryPayment", "BusinessPayment", "PromotionPayment"]),
  Amount: z.number().int().positive(),
  PartyA: z.string().min(1),
  PartyB: z.string().min(1),
  Remarks: z.string().min(1),
  QueueTimeOutURL: z.string().url(),
  ResultURL: z.string().url(),
  Occasion: z.string().optional().default(""),
});

export const b2bSchema = z.object({
  Initiator: z.string().min(1),
  SecurityCredential: z.string().min(1),
  CommandID: z.string().min(1),
  SenderIdentifierType: z.string().min(1),
  RecieverIdentifierType: z.string().min(1),
  Amount: z.number().int().positive(),
  PartyA: z.string().min(1),
  PartyB: z.string().min(1),
  AccountReference: z.string().optional().default(""),
  Remarks: z.string().min(1),
  QueueTimeOutURL: z.string().url(),
  ResultURL: z.string().url(),
});

export const transactionStatusSchema = z.object({
  Initiator: z.string().min(1),
  SecurityCredential: z.string().min(1),
  CommandID: z.literal("TransactionStatusQuery"),
  TransactionID: z.string().min(1),
  PartyA: z.string().min(1),
  IdentifierType: z.string().min(1),
  ResultURL: z.string().url(),
  QueueTimeOutURL: z.string().url(),
  Remarks: z.string().min(1),
  Occasion: z.string().optional().default(""),
});

export const accountBalanceSchema = z.object({
  Initiator: z.string().min(1),
  SecurityCredential: z.string().min(1),
  CommandID: z.literal("AccountBalance"),
  PartyA: z.string().min(1),
  IdentifierType: z.string().min(1),
  Remarks: z.string().min(1),
  QueueTimeOutURL: z.string().url(),
  ResultURL: z.string().url(),
});

export const reversalSchema = z.object({
  Initiator: z.string().min(1),
  SecurityCredential: z.string().min(1),
  CommandID: z.literal("TransactionReversal"),
  TransactionID: z.string().min(1),
  Amount: z.number().int().positive(),
  ReceiverParty: z.string().min(1),
  RecieverIdentifierType: z.string().min(1),
  ResultURL: z.string().url(),
  QueueTimeOutURL: z.string().url(),
  Remarks: z.string().min(1),
  Occasion: z.string().optional().default(""),
});
