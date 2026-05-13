export type ResultCode =
  | "0"
  | "1"
  | "1001"
  | "1019"
  | "1025"
  | "1032"
  | "1037"
  | "2001";

export type TransactionState =
  | "pending"
  | "success"
  | "user_cancelled"
  | "insufficient_funds"
  | "wrong_pin"
  | "timeout"
  | "expired"
  | "system_error";

export type FailureScenario =
  | "success"
  | "user_cancelled"
  | "insufficient_funds"
  | "wrong_pin"
  | "timeout"
  | "callback_retry"
  | "expired"
  | "system_error"
  | "slow";

export interface OAuthResponse {
  access_token: string;
  expires_in: string;
}

export interface StkPushRequestBody {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  Amount: number;
  PartyA: string;
  PartyB: string;
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

export interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface StkCallbackItem {
  Name: string;
  Value?: string | number;
}

export interface StkCallbackMetadata {
  Item: StkCallbackItem[];
}

export interface StkCallbackBody {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: StkCallbackMetadata;
    };
  };
}

export interface StkQueryRequestBody {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  CheckoutRequestID: string;
}

export interface StkQueryResponse {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: string;
  ResultDesc: string;
}

export interface C2BRegisterUrlBody {
  ShortCode: string;
  ResponseType: "Completed" | "Cancelled";
  ConfirmationURL: string;
  ValidationURL: string;
}

export interface C2BSimulateBody {
  ShortCode: string;
  CommandID: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  Amount: number;
  Msisdn: string;
  BillRefNumber: string;
}

export interface AsyncCommandBody {
  InitiatorName: string;
  SecurityCredential: string;
  CommandID: string;
  Amount?: number;
  PartyA: string;
  PartyB?: string;
  Remarks?: string;
  QueueTimeOutURL: string;
  ResultURL: string;
  Occasion?: string;
  TransactionID?: string;
  IdentifierType?: string;
}

export interface AsyncAcceptedResponse {
  OriginatorConversationID: string;
  ConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

export interface ResultParameterItem {
  Key: string;
  Value: string | number;
}

export interface ResultCallbackBody {
  Result: {
    ResultType: number;
    ResultCode: number;
    ResultDesc: string;
    OriginatorConversationID: string;
    ConversationID: string;
    TransactionID: string;
    ResultParameters?: { ResultParameter: ResultParameterItem[] };
    ReferenceData?: { ReferenceItem: ResultParameterItem | ResultParameterItem[] };
  };
}

export interface TransactionRecord {
  checkoutRequestID: string;
  merchantRequestID: string;
  conversationID?: string;
  originatorConversationID?: string;
  kind: "stk" | "c2b" | "b2c" | "b2b" | "status" | "balance" | "reversal";
  amount: number;
  phoneNumber: string;
  shortCode: string;
  callbackUrl?: string;
  state: TransactionState;
  resultCode?: number;
  resultDesc?: string;
  mpesaReceiptNumber?: string;
  createdAt: number;
  completedAt?: number;
  callbackAttempts: number;
  callbackDeliveredAt?: number;
}
