import type { FailureScenario } from "../types/daraja.js";

export interface MockConfig {
  defaultCallbackDelayMs: number;
  scenarios: Record<string, FailureScenario>;
  webhookRetry: {
    attempts: number;
    backoffMs: number;
  };
}

const SUFFIX_MAP: Record<string, FailureScenario> = {
  "00": "success",
  "01": "user_cancelled",
  "02": "insufficient_funds",
  "03": "wrong_pin",
  "04": "timeout",
  "05": "callback_retry",
  "06": "expired",
  "07": "system_error",
  "99": "slow",
};

export function pickScenario(phoneNumber: string, config: MockConfig): FailureScenario {
  const direct = config.scenarios[phoneNumber];
  if (direct) return direct;
  const suffix = phoneNumber.slice(-2);
  return SUFFIX_MAP[suffix] ?? "success";
}

export function callbackDelayFor(scenario: FailureScenario, config: MockConfig): number {
  if (scenario === "slow") return 30_000;
  if (scenario === "timeout") return -1;
  return config.defaultCallbackDelayMs;
}

export function isFailure(scenario: FailureScenario): boolean {
  return scenario !== "success" && scenario !== "callback_retry" && scenario !== "slow";
}
