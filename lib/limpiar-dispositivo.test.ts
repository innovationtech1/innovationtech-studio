import { test } from "node:test";
import assert from "node:assert/strict";
import { quitarClaves } from "./limpiar-dispositivo";

test("quitarClaves: borra solo las claves propias y deja los demás ajustes", () => {
  const raw = JSON.stringify({
    anthropicKey: "sk-ant-1",
    replicateKey: "r8_1",
    cfAccountId: "acc",
    cfToken: "tok",
    textProvider: "anthropic",
    cfTextModel: "@cf/x",
  });
  assert.deepEqual(JSON.parse(quitarClaves(raw)!), {
    anthropicKey: "",
    replicateKey: "",
    cfAccountId: "",
    cfToken: "",
    textProvider: "anthropic",
    cfTextModel: "@cf/x",
  });
});

test("quitarClaves: sin ajustes o con datos dañados no rompe nada", () => {
  assert.equal(quitarClaves(null), null);
  assert.equal(quitarClaves("no es json"), "no es json");
  assert.equal(quitarClaves(JSON.stringify({ textProvider: "cloudflare" })), JSON.stringify({ textProvider: "cloudflare" }));
});

test("claveCfDe: lee la clave de Cloudflare guardada en el navegador, o null si falta", async () => {
  const { claveCfDe } = await import("./limpiar-dispositivo");
  assert.deepEqual(claveCfDe(JSON.stringify({ cfAccountId: " acc ", cfToken: " tok ", textProvider: "x" })), { accountId: "acc", token: "tok" });
  assert.equal(claveCfDe(JSON.stringify({ cfAccountId: "acc", cfToken: "" })), null);
  assert.equal(claveCfDe(JSON.stringify({ cfAccountId: 5, cfToken: "tok" })), null);
  assert.equal(claveCfDe(null), null);
  assert.equal(claveCfDe("no es json"), null);
});

test("quitarClaveCf: borra solo la clave de Cloudflare y deja las otras claves", async () => {
  const { quitarClaveCf } = await import("./limpiar-dispositivo");
  const raw = JSON.stringify({ anthropicKey: "sk-ant-1", cfAccountId: "acc", cfToken: "tok", textProvider: "cloudflare" });
  assert.deepEqual(JSON.parse(quitarClaveCf(raw)!), { anthropicKey: "sk-ant-1", cfAccountId: "", cfToken: "", textProvider: "cloudflare" });
  assert.equal(quitarClaveCf(null), null);
  assert.equal(quitarClaveCf("no es json"), "no es json");
});
