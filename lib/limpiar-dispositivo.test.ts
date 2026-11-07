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
