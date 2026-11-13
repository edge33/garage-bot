import { Bot, Keyboard } from "grammy";
import type { Config } from "./config.ts";
import type { ActionResult, Door } from "./garage.ts";
import { createGarage } from "./garage.ts";

export type Log = (
  event: string,
  fields: Record<string, string | number | boolean>,
) => void;

const doors: Record<string, Door> = {
  "Garage piccolo": "small",
  "Garage grande": "large",
};
const keyboard = new Keyboard()
  .text("Garage piccolo")
  .row()
  .text("Garage grande")
  .resized()
  .persistent();

function actionMessage(label: string, result: ActionResult): string {
  switch (result.kind) {
    case "sent":
      return result.simulated
        ? `🧪 DRY RUN: comando simulato per ${label}. Nessuna richiesta inviata.`
        : `Comando inviato per ${label}.`;
    case "busy":
      return "Comando già in corso o troppo ravvicinato. Attendi qualche secondo.";
    case "failed":
      return `Richiesta non riuscita per ${label} (HTTP ${result.status}). Verifica il garage prima di riprovare.`;
    case "uncertain":
      return `Esito sconosciuto per ${label}: timeout o errore di rete. Verifica il garage prima di riprovare.`;
  }
}

export function createBot(
  config: Config,
  options: {
    action?: (door: Door) => Promise<ActionResult>;
    now?: () => number;
    log?: Log;
  } = {},
) {
  const bot = new Bot(config.token);
  const action = options.action ?? createGarage(config);
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => {});

  // Bound memory while retaining recent IDs across polling reconnects.
  const seen = new Set<number>();

  bot.use(async (ctx, next) => {
    if (seen.has(ctx.update.update_id)) return;

    seen.add(ctx.update.update_id);

    if (seen.size > 10_000) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }

    if (ctx.chat?.type !== "private" || !ctx.from || ctx.from.is_bot) return;

    await next();
  });

  bot.command("id", (ctx) => ctx.reply(`Il tuo ID Telegram: ${ctx.from?.id}`));

  bot.use(async (ctx, next) => {
    if (!ctx.from || !config.allowedUserIds.has(ctx.from.id)) {
      await ctx.reply("Accesso non autorizzato.");
      return;
    }

    await next();
  });

  const menu = `Scegli il garage da azionare.${config.dryRun ? "\n🧪 DRY RUN attivo: i comandi sono simulati." : ""}`;

  bot.on("message:text", async (ctx) => {
    const label = ctx.message.text;
    const door = Object.hasOwn(doors, label) ? doors[label] : undefined;

    if (!door) {
      await ctx.reply(menu, { reply_markup: keyboard });
      return;
    }

    const started = now();

    if (
      started - ctx.message.date * 1000 > 30_000 ||
      ctx.message.date * 1000 > started + 5000
    ) {
      await ctx.reply("Comando scaduto. Premi nuovamente il pulsante.", {
        reply_markup: keyboard,
      });
      return;
    }

    const result = await action(door);

    log("garage_action", {
      door,
      userId: ctx.from.id,
      dryRun: config.dryRun,
      outcome: result.kind,
      durationMs: now() - started,
    });

    await ctx.reply(actionMessage(label, result), { reply_markup: keyboard });
  });

  return bot;
}
