import assert from "node:assert/strict";
import { test } from "node:test";
import { readConfig } from "../src/config.ts";

const base = {
  TELEGRAM_BOT_TOKEN: "123:test-token",
  ALLOWED_TELEGRAM_USER_IDS: "123, 456",
};

test("dry run defaults on, permits no secret, and parses IDs", () => {
  const config = readConfig(base);

  assert.equal(config.dryRun, true);
  assert.equal(config.garageSecret, "");
  assert.deepEqual([...config.allowedUserIds], [123, 456]);
  assert.equal(config.garageUrl, "http://10.0.0.90:8443/toggleAction");
});

test("explicit dry run and live mode are supported", () => {
  assert.equal(readConfig({ ...base, DRY_RUN: "true" }).dryRun, true);
  assert.equal(
    readConfig({ ...base, DRY_RUN: "false", GARAGE_API_SECRET: "test-secret" })
      .dryRun,
    false,
  );
});

test("invalid configuration fails closed", () => {
  for (const value of ["", "TRUE", "1", "yes"]) {
    assert.throws(() => readConfig({ ...base, DRY_RUN: value }), /DRY_RUN/);
  }

  for (const value of [
    undefined,
    "",
    "123,",
    "-1",
    "0",
    "abc",
    "1.5",
    "9007199254740992",
  ]) {
    assert.throws(
      () => readConfig({ ...base, ALLOWED_TELEGRAM_USER_IDS: value }),
      /ALLOWED_TELEGRAM_USER_IDS/,
    );
  }

  assert.throws(
    () => readConfig({ ...base, TELEGRAM_BOT_TOKEN: " " }),
    /TOKEN/,
  );
  assert.throws(() => readConfig({ ...base, DRY_RUN: "false" }), /SECRET/);
  assert.throws(
    () => readConfig({ ...base, DRY_RUN: "false", GARAGE_API_SECRET: " " }),
    /SECRET/,
  );

  for (const value of [
    "invalid",
    "ftp://host",
    "http://user:pass@host",
    "http://host/path",
    "http://host?x=1",
    "http://host/#x",
  ]) {
    assert.throws(
      () => readConfig({ ...base, GARAGE_API_BASE_URL: value }),
      /BASE_URL/,
    );
  }
});
