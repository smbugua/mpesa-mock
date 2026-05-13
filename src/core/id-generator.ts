import { randomBytes, randomInt } from "node:crypto";

export function generateAccessToken(): string {
  return randomBytes(24).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32).padEnd(32, "0");
}

export function generateMerchantRequestID(): string {
  const a = randomInt(10000, 99999);
  const b = randomInt(10000000, 99999999);
  const c = randomInt(1, 9);
  return `${a}-${b}-${c}`;
}

export function generateCheckoutRequestID(date = new Date()): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yyyy = String(date.getFullYear());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `ws_CO_${dd}${mm}${yyyy}${hh}${mi}${ss}${ms}`;
}

export function generateConversationID(): string {
  const a = randomInt(1000, 9999);
  const b = randomInt(100000, 999999);
  const c = randomInt(10, 99);
  return `AG_${formatDate(new Date())}_${a}${b}${c}`;
}

export function generateOriginatorConversationID(): string {
  const a = randomInt(10000, 99999);
  const b = randomInt(1000000, 9999999);
  const c = randomInt(1, 9);
  return `${a}-${b}-${c}`;
}

export function generateMpesaReceiptNumber(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += chars[randomInt(0, chars.length)];
  }
  return out;
}

export function generateTransactionDate(date = new Date()): number {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return Number(`${yyyy}${mm}${dd}${hh}${mi}${ss}`);
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
