import { EventEmitter } from "node:events";
import pRetry, { AbortError } from "p-retry";
import type { InMemoryStore } from "./transactions.js";

export interface WebhookJob {
  id: string;
  url: string;
  body: unknown;
  scheduledAt: number;
  attempts: number;
  maxAttempts: number;
  backoffMs: number;
  transactionId?: string;
  failNTimesFirst?: number;
}

export interface DispatcherOptions {
  store?: InMemoryStore;
  fetchImpl?: typeof fetch;
  onLog?: (msg: string) => void;
}

export class WebhookDispatcher extends EventEmitter {
  private pending = new Map<string, NodeJS.Timeout>();
  private store?: InMemoryStore;
  private fetchImpl: typeof fetch;
  private onLog?: (msg: string) => void;

  constructor(opts: DispatcherOptions = {}) {
    super();
    this.store = opts.store;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.onLog = opts.onLog;
  }

  schedule(job: WebhookJob, delayMs: number): void {
    if (delayMs < 0) {
      this.emit("skipped", { id: job.id, reason: "timeout" });
      return;
    }
    if (this.pending.has(job.id)) {
      clearTimeout(this.pending.get(job.id));
    }
    const handle = setTimeout(() => {
      this.pending.delete(job.id);
      void this.fire(job);
    }, delayMs);
    this.pending.set(job.id, handle);
    this.emit("scheduled", { id: job.id, delayMs, url: job.url });
  }

  cancel(id: string): boolean {
    const h = this.pending.get(id);
    if (!h) return false;
    clearTimeout(h);
    this.pending.delete(id);
    return true;
  }

  pendingIds(): string[] {
    return Array.from(this.pending.keys());
  }

  async fire(job: WebhookJob): Promise<void> {
    let attempt = 0;
    try {
      await pRetry(
        async () => {
          attempt += 1;
          if (typeof job.failNTimesFirst === "number" && attempt <= job.failNTimesFirst) {
            this.onLog?.(`webhook attempt ${attempt} forced-fail for ${job.url}`);
            throw new Error(`forced fail ${attempt}`);
          }
          const res = await this.fetchImpl(job.url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(job.body),
          });
          if (!res.ok && res.status >= 500) {
            throw new Error(`callback ${res.status}`);
          }
          if (!res.ok && res.status >= 400) {
            throw new AbortError(`callback ${res.status}`);
          }
          this.emit("delivered", { id: job.id, url: job.url, attempts: attempt });
          if (this.store && job.transactionId) {
            this.store.update(job.transactionId, {
              callbackAttempts: attempt,
              callbackDeliveredAt: Date.now(),
            });
          }
        },
        {
          retries: job.maxAttempts - 1,
          minTimeout: job.backoffMs,
          factor: 2,
          onFailedAttempt: (err) => {
            this.onLog?.(`webhook ${job.url} attempt ${err.attemptNumber} failed: ${err.message}`);
          },
        },
      );
    } catch (err) {
      this.emit("failed", {
        id: job.id,
        url: job.url,
        attempts: attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      if (this.store && job.transactionId) {
        this.store.update(job.transactionId, { callbackAttempts: attempt });
      }
    }
  }

  shutdown(): void {
    for (const handle of this.pending.values()) clearTimeout(handle);
    this.pending.clear();
  }
}
