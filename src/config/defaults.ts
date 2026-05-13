export const DEFAULTS = {
  port: 4000,
  host: "0.0.0.0",
  callbackDelayMs: 8000,
  callbackRetryAttempts: 3,
  callbackRetryBackoffMs: 1000,
  oauthTokenExpiresIn: "3599",
  testCredentials: {
    consumerKey: "test_key",
    consumerSecret: "test_secret",
  },
  testShortcode: "174379",
  testTill: "600000",
  partyB: "254708374149",
} as const;

export const RESULT_CODES = {
  SUCCESS: 0,
  INSUFFICIENT_FUNDS: 1,
  SYSTEM_ERROR: 1025,
  USER_CANCELLED: 1032,
  TRANSACTION_EXPIRED: 1037,
  WRONG_PIN: 2001,
} as const;

export const RESULT_DESCS: Record<number, string> = {
  0: "The service request is processed successfully.",
  1: "The balance is insufficient for the transaction.",
  1025: "An error occurred while sending a push request.",
  1032: "Request cancelled by user.",
  1037: "DS timeout. User cannot be reached.",
  2001: "The initiator information is invalid.",
};
