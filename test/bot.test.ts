import assert from "node:assert/strict";
import { test } from "node:test";
import type { Update } from "grammy/types";
import { createBot } from "../src/bot.ts";
import { readConfig } from "../src/config.ts";
import type { ActionResult, Door } from "../src/garage.ts";

const config = readConfig({
  TELEGRAM_BOT_TOKEN: "123:test-token",
  ALLOWED_TELEGRAM_USER_IDS: "123,456",
});

const time = 1_800_000_000_000;

function message(
  id: number,
  text: string,
  user = 123,
  date = time / 1000,
  group = false,
): Update {
  return {
    update_id: id,
    message: {
      message_id: id,
      date,
      from: { id: user, is_bot: false, first_name: "Test" },
      chat: group
        ? { id: -100, type: "group", title: "Group" }
        : { id: user, type: "private", first_name: "Test" },
      text,
      entities: text.startsWith("/")
        ? [{ type: "bot_command", offset: 0, length: text.length }]
        : [],
    },
  };
}

function setup(
  options: {
    useRealDryRun?: boolean;
    dryRun?: boolean;
    result?: ActionResult;
  } = {},
) {
  const actions: Door[] = [];
  const replies: Array<{ text: string; reply_markup?: unknown }> = [];
  const logs: Array<Record<string, string | number | boolean>> = [];
  const bot = createBot(
    { ...config, dryRun: options.dryRun ?? true },
    {
      now: () => time,
      log: (_event, fields) => logs.push(fields),
      ...(options.useRealDryRun
        ? {}
        : {
            action: async (door: Door) => {
              actions.push(door);
              return (
                options.result ?? { kind: "sent" as const, simulated: true }
              );
            },
          }),
    },
  );

  bot.botInfo = {
    id: 999,
    is_bot: true,
    first_name: "Garage",
    username: "garage_test_bot",
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
  };

  // Intercept every Telegram call; tests never need a token or the network.
  bot.api.config.use(async (_previous, method, payload) => {
    assert.equal(method, "sendMessage");
    assert.ok("text" in payload);
    replies.push({
      text: String(payload.text),
      ...("reply_markup" in payload
        ? { reply_markup: payload.reply_markup }
        : {}),
    });

    // Only sendMessage is used above; its result is intentionally unused by handlers.
    return { ok: true, result: {} } as Awaited<
      ReturnType<typeof _previous<typeof method>>
    >;
  });

  return { bot, actions, replies, logs };
}

test("authorized menus expose persistent buttons and dry-run status", async () => {
  const { bot, actions, replies } = setup();

  for (const [index, text] of [
    "/start",
    "/garage",
    "hello",
    "constructor",
  ].entries()) {
    await bot.handleUpdate(message(index, text));
  }

  assert.equal(actions.length, 0);
  assert.equal(replies.length, 4);

  for (const reply of replies) {
    assert.match(reply.text, /DRY RUN/);
    assert.deepEqual(JSON.parse(JSON.stringify(reply.reply_markup)), {
      keyboard: [[{ text: "Garage piccolo" }], [{ text: "Garage grande" }]],
      resize_keyboard: true,
      is_persistent: true,
    });
  }
});

test("both buttons map correctly and replies and logs indicate simulation", async () => {
  const { bot, actions, replies, logs } = setup();

  await bot.handleUpdate(message(1, "Garage piccolo"));
  await bot.handleUpdate(message(2, "Garage grande", 456));

  assert.deepEqual(actions, ["small", "large"]);
  assert.match(
    replies[0]?.text ?? "",
    /DRY RUN.*Garage piccolo.*Nessuna richiesta/,
  );
  assert.match(
    replies[1]?.text ?? "",
    /DRY RUN.*Garage grande.*Nessuna richiesta/,
  );
  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.dryRun, true);
  assert.equal(logs[1]?.userId, 456);
  assert.ok(!JSON.stringify(logs).includes(config.token));
});

test("unauthorized users and group chats cannot operate doors", async () => {
  const { bot, actions, replies } = setup();

  await bot.handleUpdate(message(1, "Garage piccolo", 789));
  await bot.handleUpdate(message(2, "Garage grande", 123, time / 1000, true));
  await bot.handleUpdate(message(3, "/id", 123, time / 1000, true));

  assert.deepEqual(actions, []);
  assert.equal(replies.length, 1);
  assert.match(replies[0]?.text ?? "", /non autorizzato/);
});

test("ID lookup works privately without granting garage access", async () => {
  const { bot, actions, replies } = setup();

  await bot.handleUpdate(message(1, "/id", 789));
  await bot.handleUpdate(message(2, "Garage piccolo", 789));

  assert.match(replies[0]?.text ?? "", /789/);
  assert.match(replies[1]?.text ?? "", /non autorizzato/);
  assert.deepEqual(actions, []);
});

test("stale and duplicate commands cannot actuate", async () => {
  const { bot, actions, replies } = setup();

  await bot.handleUpdate(message(1, "Garage piccolo", 123, time / 1000 - 31));
  await bot.handleUpdate(message(2, "Garage piccolo"));
  await bot.handleUpdate(message(2, "Garage piccolo"));

  assert.deepEqual(actions, ["small"]);
  assert.equal(replies.length, 2);
  assert.match(replies[0]?.text ?? "", /scaduto/);
});

test("real dry-run action shares per-door cooldown across trusted users", async () => {
  const { bot, replies } = setup({ useRealDryRun: true });

  await bot.handleUpdate(message(1, "Garage piccolo"));
  await bot.handleUpdate(message(2, "Garage piccolo", 456));
  await bot.handleUpdate(message(3, "Garage grande", 456));

  assert.match(replies[0]?.text ?? "", /DRY RUN/);
  assert.match(replies[1]?.text ?? "", /troppo ravvicinato/);
  assert.match(replies[2]?.text ?? "", /DRY RUN/);
});

test("live replies distinguish acceptance, failure, and unknown outcomes", async () => {
  const cases: Array<{ result: ActionResult; expected: RegExp }> = [
    { result: { kind: "sent", simulated: false }, expected: /Comando inviato/ },
    {
      result: { kind: "failed", status: 503 },
      expected: /non riuscita.*HTTP 503/,
    },
    { result: { kind: "uncertain" }, expected: /Esito sconosciuto.*Verifica/ },
  ];

  for (const { result, expected } of cases) {
    const { bot, replies, logs } = setup({ dryRun: false, result });

    await bot.handleUpdate(message(1, "/start"));
    await bot.handleUpdate(message(2, "Garage piccolo"));

    assert.doesNotMatch(replies[0]?.text ?? "", /DRY RUN/);
    assert.match(replies[1]?.text ?? "", expected);
    assert.doesNotMatch(replies[1]?.text ?? "", /DRY RUN|aperto/);
    assert.equal(logs[0]?.dryRun, false);
  }
});
