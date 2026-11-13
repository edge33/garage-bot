import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { readConfig } from "../src/config.ts";
import { createGarage } from "../src/garage.ts";

const config = readConfig({
  TELEGRAM_BOT_TOKEN: "123:test-token",
  ALLOWED_TELEGRAM_USER_IDS: "123,456",
});

const liveConfig = { ...config, dryRun: false, garageSecret: "test-secret" };

test("dry run never calls fetch for either door", async () => {
  let calls = 0;
  const action = createGarage(config, {
    fetch: async () => {
      calls += 1;
      throw new Error("Network must not be used");
    },
  });

  assert.deepEqual(await action("small"), { kind: "sent", simulated: true });
  assert.deepEqual(await action("large"), { kind: "sent", simulated: true });
  assert.equal(calls, 0);
});

test("live mode sends exact JSON for each door and accepts empty 2xx responses", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const action = createGarage(liveConfig, {
    fetch: async (url, init) => {
      assert.ok(init);
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    },
  });

  for (const door of ["small", "large"] as const) {
    assert.deepEqual(await action(door), { kind: "sent", simulated: false });
  }

  assert.equal(calls.length, 2);

  for (const [index, door] of ["small", "large"].entries()) {
    const call = calls[index];
    assert.ok(call);
    assert.equal(call.url, "http://10.0.0.90:8443/toggleAction");
    assert.equal(call.init.method, "POST");
    assert.deepEqual(call.init.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(String(call.init.body)), {
      secret: "test-secret",
      door,
    });
    assert.equal(call.init.redirect, "error");
    assert.ok(call.init.signal instanceof AbortSignal);
  }
});

test("cooldowns apply in dry run independently per door", async () => {
  let time = 0;
  const action = createGarage(config, { now: () => time });

  await action("small");
  assert.deepEqual(await action("small"), { kind: "busy" });
  assert.deepEqual(await action("large"), { kind: "sent", simulated: true });

  time = 4999;
  assert.deepEqual(await action("small"), { kind: "busy" });

  time = 5000;
  assert.deepEqual(await action("small"), { kind: "sent", simulated: true });
});

test("in-flight guard remains active after the cooldown expires", async () => {
  let time = 0;
  let release: (response: Response) => void = () => {};
  const action = createGarage(liveConfig, {
    now: () => time,
    fetch: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });

  const first = action("small");
  time = 6000;

  assert.deepEqual(await action("small"), { kind: "busy" });

  release(new Response(null, { status: 204 }));
  assert.deepEqual(await first, { kind: "sent", simulated: false });
});

test("HTTP failures and network failures are not retried and retain cooldown", async () => {
  for (const failure of ["http", "network"] as const) {
    let calls = 0;
    const action = createGarage(liveConfig, {
      fetch: async () => {
        calls += 1;

        if (failure === "network") throw new TypeError("Connection lost");

        return new Response(null, { status: 503 });
      },
    });

    assert.deepEqual(
      await action("small"),
      failure === "http"
        ? { kind: "failed", status: 503 }
        : { kind: "uncertain" },
    );
    assert.deepEqual(await action("small"), { kind: "busy" });
    assert.equal(calls, 1);
  }
});

test("native fetch times out and rejects redirects without following them", async (t) => {
  let targetHits = 0;
  let slowHits = 0;
  const server = createServer((request, response) => {
    if (request.url === "/slow") {
      slowHits += 1;
      return;
    }

    if (request.url === "/redirect") {
      response.writeHead(307, { Location: "/target" });
      response.end();
      return;
    }

    targetHits += 1;
    response.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const timeoutAction = createGarage(
    { ...liveConfig, garageUrl: `${origin}/slow` },
    { timeoutMs: 100 },
  );
  const redirectAction = createGarage({
    ...liveConfig,
    garageUrl: `${origin}/redirect`,
  });

  assert.deepEqual(await timeoutAction("small"), { kind: "uncertain" });
  assert.deepEqual(await redirectAction("small"), { kind: "uncertain" });
  assert.equal(slowHits, 1);
  assert.equal(targetHits, 0);
});
