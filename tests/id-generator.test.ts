import { describe, it, expect } from "vitest";
import {
  generateCheckoutRequestID,
  generateMerchantRequestID,
  generateMpesaReceiptNumber,
  generateAccessToken,
  generateTransactionDate,
} from "../src/core/id-generator.js";

describe("id-generator", () => {
  it("generateCheckoutRequestID matches ws_CO_DDMMYYYYHHMMSSXXX format", () => {
    const id = generateCheckoutRequestID(new Date("2026-05-13T12:34:56.789Z"));
    expect(id).toMatch(/^ws_CO_\d{17}$/);
  });

  it("generateMerchantRequestID matches Daraja shape", () => {
    expect(generateMerchantRequestID()).toMatch(/^\d{5}-\d{7,8}-\d$/);
  });

  it("generateMpesaReceiptNumber yields 10 uppercase alphanumerics without confusing chars", () => {
    const r = generateMpesaReceiptNumber();
    expect(r).toMatch(/^[A-Z0-9]{10}$/);
    expect(r).not.toMatch(/[ILO01]/);
  });

  it("generateAccessToken yields a 32-char string", () => {
    expect(generateAccessToken()).toMatch(/^[a-zA-Z0-9]{32}$/);
  });

  it("generateTransactionDate yields 14-digit number", () => {
    const n = generateTransactionDate(new Date("2026-05-13T12:34:56Z"));
    expect(String(n)).toMatch(/^\d{14}$/);
  });
});
