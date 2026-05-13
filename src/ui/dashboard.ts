import type { InMemoryStore } from "../core/transactions.js";
import type { WebhookDispatcher } from "../core/webhook-dispatcher.js";

export function startTui(_store: InMemoryStore, _dispatcher: WebhookDispatcher): { stop: () => void } {
  console.log("Terminal UI not implemented yet — open the web dashboard at /__mock__/dashboard instead.");
  return { stop: () => undefined };
}
