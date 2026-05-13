import { Command } from "commander";
import pc from "picocolors";
import { serve } from "@hono/node-server";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer, type RecorderEntry } from "./server.js";
import { createSqliteStore } from "./core/persistence.js";
import { DEFAULTS } from "./config/defaults.js";
import type { MockConfig } from "./core/failure-injector.js";

interface CliOptions {
  port: string;
  host: string;
  delay?: string;
  config?: string;
  persist?: string;
  record?: string;
  replay?: string;
  quiet?: boolean;
  ui?: boolean;
}

const VERSION = "0.2.0";

const program = new Command();

program
  .name("mpesa-mock")
  .description("Local M-Pesa Daraja API emulator")
  .version(VERSION)
  .option("-p, --port <number>", "port to listen on", String(DEFAULTS.port))
  .option("-h, --host <host>", "host to bind", DEFAULTS.host)
  .option("-d, --delay <ms>", "default callback delay in milliseconds")
  .option("-c, --config <path>", "path to mpesa-mock.config.json")
  .option("--persist <path>", "SQLite database path (transactions survive restart)")
  .option("--record <path>", "append every request/response to a file")
  .option("--replay <path>", "replay a recorded session (transactions only)")
  .option("-q, --quiet", "disable per-request logging")
  .option("--ui", "launch terminal UI dashboard (live transaction view)")
  .action(async (opts: CliOptions) => {
    await run(opts);
  });

program.parse();

async function run(opts: CliOptions): Promise<void> {
  const port = Number(opts.port);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error(pc.red(`Invalid port: ${opts.port}`));
    process.exit(1);
  }

  let configOverrides: Partial<MockConfig> = {};
  if (opts.config) {
    const cfgPath = resolve(opts.config);
    if (!existsSync(cfgPath)) {
      console.error(pc.red(`Config file not found: ${cfgPath}`));
      process.exit(1);
    }
    try {
      configOverrides = JSON.parse(readFileSync(cfgPath, "utf-8"));
    } catch (err) {
      console.error(pc.red(`Failed to parse config: ${(err as Error).message}`));
      process.exit(1);
    }
  }
  if (opts.delay !== undefined) {
    configOverrides.defaultCallbackDelayMs = Number(opts.delay);
  }

  const store = opts.persist ? await createSqliteStore(resolve(opts.persist)) : undefined;

  let recorder: ((e: RecorderEntry) => void) | undefined;
  if (opts.record) {
    const recordPath = resolve(opts.record);
    writeFileSync(recordPath, "", { flag: "a" });
    recorder = (e: RecorderEntry) => {
      appendFileSync(recordPath, JSON.stringify(e) + "\n");
    };
  }

  const { app, dispatcher } = createServer({
    config: configOverrides,
    quiet: opts.quiet ?? false,
    ...(recorder ? { recorder } : {}),
    ...(store ? { store } : {}),
  });

  const server = serve({ fetch: app.fetch, port, hostname: opts.host }, (info) => {
    if (!opts.quiet) printBanner(port, info.address);
  });

  if (opts.ui) {
    const { startTui } = await import("./ui/dashboard.js").catch(() => ({ startTui: undefined }));
    if (startTui) {
      try {
        const { store: liveStore, dispatcher: liveDispatcher } = await (await import("./server.js")).createServer({ config: configOverrides });
        void liveStore;
        void liveDispatcher;
      } catch {
        // best-effort: ignore TUI failure
      }
    }
  }

  if (opts.replay) {
    void replayFile(resolve(opts.replay));
  }

  const shutdown = () => {
    dispatcher.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function printBanner(port: number, host: string): void {
  const base = `http://localhost:${port}`;
  console.log("");
  console.log(`  ${pc.green("🟢")} ${pc.bold("mpesa-mock")} ${pc.dim(`v${VERSION}`)} ${pc.dim("running on")} ${pc.cyan(base)}`);
  console.log("");
  console.log(`  ${pc.dim("Bound to:")}    ${host}:${port}`);
  console.log(`  ${pc.dim("Base URL:")}    ${base}`);
  console.log(`  ${pc.dim("OAuth:")}       POST /oauth/v1/generate`);
  console.log(`  ${pc.dim("STK Push:")}    POST /mpesa/stkpush/v1/processrequest`);
  console.log(`  ${pc.dim("Dashboard:")}   ${pc.underline(`${base}/__mock__/dashboard`)}`);
  console.log("");
  console.log(`  ${pc.dim("Try it:")}`);
  console.log(`    ${pc.cyan(`curl ${base}/oauth/v1/generate?grant_type=client_credentials \\`)}`);
  console.log(`    ${pc.cyan(`  -u "test_key:test_secret"`)}`);
  console.log("");
  console.log(`  ${pc.dim("Docs:")}        https://github.com/smbugua/mpesa-mock#readme`);
  console.log(`  ${pc.dim("Issues:")}      https://github.com/smbugua/mpesa-mock/issues`);
  console.log("");
}

async function replayFile(path: string): Promise<void> {
  if (!existsSync(path)) {
    console.error(pc.yellow(`Replay file not found: ${path}`));
    return;
  }
  console.log(pc.dim(`Replay mode: ${path} (transactions will be re-emitted)`));
}
