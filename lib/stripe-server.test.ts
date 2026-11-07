import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { stripeModoLive } from "./stripe-server";

const antes = process.env.STRIPE_SECRET_KEY;
afterEach(() => {
  if (antes === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = antes;
});

test("stripeModoLive: claves reales (sk_live_ / rk_live_) → true", () => {
  process.env.STRIPE_SECRET_KEY = "sk_live_abc";
  assert.equal(stripeModoLive(), true);
  process.env.STRIPE_SECRET_KEY = "rk_live_abc";
  assert.equal(stripeModoLive(), true);
});

test("stripeModoLive: claves de prueba o sin clave → false", () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_abc";
  assert.equal(stripeModoLive(), false);
  process.env.STRIPE_SECRET_KEY = "rk_test_abc";
  assert.equal(stripeModoLive(), false);
  delete process.env.STRIPE_SECRET_KEY;
  assert.equal(stripeModoLive(), false);
});
