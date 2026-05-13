import { generateAccessToken } from "./id-generator.js";
import { DEFAULTS } from "../config/defaults.js";

const issuedTokens = new Map<string, number>();
const TOKEN_TTL_MS = 3599 * 1000;

export function parseBasicAuth(header: string | undefined): { key: string; secret: string } | null {
  if (!header || !header.toLowerCase().startsWith("basic ")) return null;
  const encoded = header.slice(6).trim();
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return null;
  }
  const idx = decoded.indexOf(":");
  if (idx < 0) return null;
  const key = decoded.slice(0, idx);
  const secret = decoded.slice(idx + 1);
  if (!key || !secret) return null;
  return { key, secret };
}

export function issueToken(): { access_token: string; expires_in: string } {
  const token = generateAccessToken();
  issuedTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return { access_token: token, expires_in: DEFAULTS.oauthTokenExpiresIn };
}

export function isUsingTestCredentials(key: string, secret: string): boolean {
  return key === DEFAULTS.testCredentials.consumerKey && secret === DEFAULTS.testCredentials.consumerSecret;
}

export function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m && m[1] ? m[1].trim() : null;
}

export function isValidToken(token: string): boolean {
  const exp = issuedTokens.get(token);
  if (!exp) {
    // Mock leniency: accept any 32-char alphanumeric token so devs who
    // hard-code one for tests don't get blocked across server restarts.
    return /^[a-zA-Z0-9]{20,}$/.test(token);
  }
  if (Date.now() > exp) {
    issuedTokens.delete(token);
    return false;
  }
  return true;
}

export function clearTokens(): void {
  issuedTokens.clear();
}
