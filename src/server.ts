import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { InMemoryStore } from "./core/transactions.js";
import { WebhookDispatcher } from "./core/webhook-dispatcher.js";
import { oauthRoute } from "./routes/oauth.js";
import { stkPushRoute } from "./routes/stk-push.js";
import { stkQueryRoute } from "./routes/stk-query.js";
import { c2bRoute } from "./routes/c2b.js";
import { b2cRoute } from "./routes/b2c.js";
import { b2bRoute } from "./routes/b2b.js";
import { transactionStatusRoute } from "./routes/transaction-status.js";
import { accountBalanceRoute } from "./routes/account-balance.js";
import { reversalRoute } from "./routes/reversal.js";
import { dashboardRoute } from "./routes/dashboard.js";
import type { MockConfig } from "./core/failure-injector.js";
import { DEFAULTS } from "./config/defaults.js";

export interface AppVariables {
  store: InMemoryStore;
  dispatcher: WebhookDispatcher;
  config: MockConfig;
  log?: (msg: string) => void;
  recorder?: (entry: RecorderEntry) => void;
}

export interface AppContext {
  Variables: AppVariables;
}

export interface RecorderEntry {
  ts: number;
  direction: "request" | "response" | "callback";
  method: string;
  path: string;
  status?: number;
  body?: unknown;
}

export interface CreateServerOptions {
  config?: Partial<MockConfig>;
  quiet?: boolean;
  recorder?: (entry: RecorderEntry) => void;
  store?: InMemoryStore;
}

export function defaultConfig(overrides: Partial<MockConfig> = {}): MockConfig {
  return {
    defaultCallbackDelayMs: overrides.defaultCallbackDelayMs ?? DEFAULTS.callbackDelayMs,
    scenarios: overrides.scenarios ?? {},
    webhookRetry: {
      attempts: overrides.webhookRetry?.attempts ?? DEFAULTS.callbackRetryAttempts,
      backoffMs: overrides.webhookRetry?.backoffMs ?? DEFAULTS.callbackRetryBackoffMs,
    },
  };
}

export function createServer(opts: CreateServerOptions = {}): {
  app: Hono<AppContext>;
  store: InMemoryStore;
  dispatcher: WebhookDispatcher;
  config: MockConfig;
} {
  const store = opts.store ?? new InMemoryStore();
  const config = defaultConfig(opts.config);
  const log = opts.quiet ? undefined : (msg: string) => console.log(msg);
  const dispatcher = new WebhookDispatcher({ store, onLog: log });

  const app = new Hono<AppContext>();

  if (!opts.quiet) {
    app.use("*", honoLogger((msg) => console.log(msg)));
  }

  app.use("*", async (c, next) => {
    c.set("store", store);
    c.set("dispatcher", dispatcher);
    c.set("config", config);
    if (log) c.set("log", log);
    if (opts.recorder) c.set("recorder", opts.recorder);
    await next();
  });

  app.get("/", (c) => c.json({ name: "mpesa-mock", status: "ok" }));
  app.get("/__mock__/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));

  app.route("/", oauthRoute());
  app.route("/", stkPushRoute());
  app.route("/", stkQueryRoute());
  app.route("/", c2bRoute());
  app.route("/", b2cRoute());
  app.route("/", b2bRoute());
  app.route("/", transactionStatusRoute());
  app.route("/", accountBalanceRoute());
  app.route("/", reversalRoute());
  app.route("/", dashboardRoute());

  app.notFound((c) =>
    c.json(
      {
        errorCode: "404.000.01",
        errorMessage: `Not found: ${c.req.method} ${c.req.path}`,
      },
      404,
    ),
  );

  return { app, store, dispatcher, config };
}
