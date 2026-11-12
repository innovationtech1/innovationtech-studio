import test from "node:test";
import assert from "node:assert/strict";
import { llaveCache, tomasValidas } from "./video-ia";

test("llaveCache: sin variación es la misma llave de siempre", () => {
  const base = llaveCache("neg1", "a".repeat(64), "zoom lento", "modelo@768P");
  assert.equal(llaveCache("neg1", "a".repeat(64), "zoom lento", "modelo@768P", 0), base);
  assert.equal(llaveCache("neg1", "a".repeat(64), "zoom lento", "modelo@768P", undefined), base);
});

test("llaveCache: cada variación da una llave distinta", () => {
  const args = ["neg1", "a".repeat(64), "zoom lento", "modelo@768P"] as const;
  const l0 = llaveCache(...args);
  const l1 = llaveCache(...args, 1);
  const l2 = llaveCache(...args, 2);
  assert.notEqual(l1, l0);
  assert.notEqual(l2, l1);
  assert.equal(llaveCache(...args, 1), l1);
});

test("tomasValidas: acepta la variación y rechaza valores raros", () => {
  const k = "negocios/n/fotos/" + "a".repeat(64) + ".jpg";
  assert.deepEqual(tomasValidas([{ imagenKey: k, movimiento: "zoom" }]), [{ imagenKey: k, movimiento: "zoom", variacion: 0 }]);
  assert.deepEqual(tomasValidas([{ imagenKey: k, movimiento: "zoom", variacion: 3 }]), [{ imagenKey: k, movimiento: "zoom", variacion: 3 }]);
  assert.equal(tomasValidas([{ imagenKey: k, movimiento: "zoom", variacion: -1 }]), null);
  assert.equal(tomasValidas([{ imagenKey: k, movimiento: "zoom", variacion: 2.5 }]), null);
  assert.equal(tomasValidas([{ imagenKey: k, movimiento: "zoom", variacion: 1000 }]), null);
  assert.equal(tomasValidas([{ imagenKey: k, movimiento: "zoom", variacion: "2" }]), null);
  assert.equal(tomasValidas([]), null);
});
