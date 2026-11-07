import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getCreds, refund, clavePropiaCF } from "./cf-auth";

const VARS = ["STUDIO_CUENTAS", "CF_ACCOUNT_ID", "CF_API_TOKEN", "DEMO_MODE"] as const;
const guardado: Record<string, string | undefined> = {};
for (const v of VARS) guardado[v] = process.env[v];
afterEach(() => {
  for (const v of VARS) {
    if (guardado[v] === undefined) delete process.env[v];
    else process.env[v] = guardado[v];
  }
});

const pedido = (h: Record<string, string> = {}, ip = "1.1.1.1") =>
  new Request("http://x/api", { headers: { "x-forwarded-for": ip, ...h } });

test("cuentas activas: sin encabezados usa las credenciales del entorno, sin DEMO_LIMIT", () => {
  process.env.STUDIO_CUENTAS = "on";
  process.env.CF_ACCOUNT_ID = "acc-env";
  process.env.CF_API_TOKEN = "tok-env";
  const req = pedido({}, "9.9.9.1");
  for (let i = 0; i < 20; i++) {
    const c = getCreds(req, "text");
    assert.ok(!("error" in c));
    assert.equal(c.accountId, "acc-env");
    assert.equal(c.token, "tok-env");
    assert.equal(c.demo, false);
  }
});

test("cuentas activas: las credenciales del cliente tienen prioridad", () => {
  process.env.STUDIO_CUENTAS = "on";
  process.env.CF_ACCOUNT_ID = "acc-env";
  process.env.CF_API_TOKEN = "tok-env";
  const c = getCreds(pedido({ "x-cf-account": " a1 ", "x-cf-token": "t1" }), "text");
  assert.ok(!("error" in c));
  assert.equal(c.accountId, "a1");
  assert.equal(c.demo, false);
});

test("cuentas activas: sin variables ni encabezados devuelve el error 401", () => {
  process.env.STUDIO_CUENTAS = "on";
  delete process.env.CF_ACCOUNT_ID;
  delete process.env.CF_API_TOKEN;
  const c = getCreds(pedido(), "text");
  assert.ok("error" in c);
  assert.equal(c.status, 401);
  assert.match(c.error, /Faltan tu Account ID/);
});

test("cuentas activas: refund no hace nada", () => {
  process.env.STUDIO_CUENTAS = "on";
  assert.doesNotThrow(() => refund(pedido(), "text", 3));
});

test("cuentas apagadas: la petición 16 de texto da DEMO_LIMIT (límite 15)", () => {
  delete process.env.STUDIO_CUENTAS;
  process.env.CF_ACCOUNT_ID = "acc-env";
  process.env.CF_API_TOKEN = "tok-env";
  delete process.env.DEMO_MODE;
  const req = pedido({}, "9.9.9.2");
  for (let i = 0; i < 15; i++) {
    const c = getCreds(req, "text");
    assert.ok(!("error" in c));
    assert.equal(c.demo, true);
  }
  const c16 = getCreds(req, "text");
  assert.ok("error" in c16);
  assert.match(c16.error, /^DEMO_LIMIT/);
  assert.equal(c16.status, 429);
});

test("clavePropiaCF exige ambos encabezados no vacíos", () => {
  assert.equal(clavePropiaCF(pedido({ "x-cf-account": "a", "x-cf-token": "t" })), true);
  assert.equal(clavePropiaCF(pedido({ "x-cf-account": "a" })), false);
  assert.equal(clavePropiaCF(pedido({ "x-cf-account": "a", "x-cf-token": "   " })), false);
  assert.equal(clavePropiaCF(pedido()), false);
});
