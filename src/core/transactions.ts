import { EventEmitter } from "node:events";
import type { TransactionRecord, TransactionState } from "../types/daraja.js";

export interface TransactionStore {
  put(record: TransactionRecord): void;
  get(checkoutRequestID: string): TransactionRecord | undefined;
  getByConversationID(id: string): TransactionRecord | undefined;
  list(limit?: number): TransactionRecord[];
  update(checkoutRequestID: string, patch: Partial<TransactionRecord>): TransactionRecord | undefined;
  clear(): void;
}

export class InMemoryStore extends EventEmitter implements TransactionStore {
  private byCheckout = new Map<string, TransactionRecord>();
  private byConversation = new Map<string, string>();

  put(record: TransactionRecord): void {
    this.byCheckout.set(record.checkoutRequestID, record);
    if (record.conversationID) {
      this.byConversation.set(record.conversationID, record.checkoutRequestID);
    }
    this.emit("change", record);
  }

  get(checkoutRequestID: string): TransactionRecord | undefined {
    return this.byCheckout.get(checkoutRequestID);
  }

  getByConversationID(id: string): TransactionRecord | undefined {
    const key = this.byConversation.get(id);
    return key ? this.byCheckout.get(key) : undefined;
  }

  list(limit?: number): TransactionRecord[] {
    const all = Array.from(this.byCheckout.values()).sort((a, b) => b.createdAt - a.createdAt);
    return typeof limit === "number" ? all.slice(0, limit) : all;
  }

  update(checkoutRequestID: string, patch: Partial<TransactionRecord>): TransactionRecord | undefined {
    const existing = this.byCheckout.get(checkoutRequestID);
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    this.byCheckout.set(checkoutRequestID, next);
    if (next.conversationID) this.byConversation.set(next.conversationID, checkoutRequestID);
    this.emit("change", next);
    return next;
  }

  clear(): void {
    this.byCheckout.clear();
    this.byConversation.clear();
    this.emit("clear");
  }
}

export function stateToResultCode(state: TransactionState): number {
  switch (state) {
    case "success": return 0;
    case "insufficient_funds": return 1;
    case "user_cancelled": return 1032;
    case "wrong_pin": return 2001;
    case "expired": return 1037;
    case "system_error": return 1025;
    case "pending": return 1019;
    case "timeout": return 1037;
  }
}

export function stateToResultDesc(state: TransactionState): string {
  switch (state) {
    case "success": return "The service request is processed successfully.";
    case "insufficient_funds": return "The balance is insufficient for the transaction.";
    case "user_cancelled": return "Request cancelled by user.";
    case "wrong_pin": return "The initiator information is invalid.";
    case "expired": return "DS timeout. User cannot be reached.";
    case "system_error": return "An error occurred while sending a push request.";
    case "pending": return "The transaction is being processed.";
    case "timeout": return "DS timeout. User cannot be reached.";
  }
}
