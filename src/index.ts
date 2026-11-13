import { GrammyError, HttpError } from "grammy";
import type { Log } from "./bot.ts";
import { createBot } from "./bot.ts";
import { readConfig } from "./config.ts";

const log: Log = (event, fields) =>
  console.log(JSON.stringify({ event, ...fields }));

async function main() {
  const config = readConfig(process.env);
  const bot = createBot(config, { log });
  let stopping = false;

  const shutdown = () => {
    stopping = true;

    if (bot.isRunning()) {
      void bot
        .stop()
        .catch(() => log("shutdown_error", { category: "telegram" }));
    }
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  bot.catch((error) => {
    const cause = error.error;

    if (cause instanceof GrammyError && [401, 409].includes(cause.error_code)) {
      log("telegram_fatal", { code: cause.error_code });
      process.exitCode = 1;
      shutdown();
      return;
    }

    log("telegram_handler_error", {
      category: cause instanceof HttpError ? "network" : "handler",
    });
  });

  log("starting", { dryRun: config.dryRun });

  await bot.init();

  if (stopping) return;

  await bot.start({
    // Never replay physical commands queued while the service was offline.
    drop_pending_updates: true,
    allowed_updates: ["message"],
    onStart: () => log("polling_started", { dryRun: config.dryRun }),
  });
}

main().catch(() => {
  // Telegram transport errors can embed the token in their URL.
  log("fatal", {
    message:
      "Startup or polling failed. Check configuration, connectivity, and competing bot instances.",
  });
  process.exitCode = 1;
});
