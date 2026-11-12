import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PASOS, anotar, crear, deshacer, rehacer } from "./historial";

test("anotar y deshacer vuelven al estado anterior", () => {
  let h = crear("a");
  h = anotar(h, "b");
  h = anotar(h, "c");
  h = deshacer(deshacer(h));
  assert.equal(h.presente, "a");
  assert.deepEqual(h.futuro, ["b", "c"]);
  assert.deepEqual(h.pasado, []);
});

test("rehacer vuelve a aplicar lo deshecho", () => {
  let h = anotar(anotar(crear("a"), "b"), "c");
  h = rehacer(deshacer(deshacer(h)));
  assert.equal(h.presente, "b");
  assert.deepEqual(h.pasado, ["a"]);
  assert.deepEqual(h.futuro, ["c"]);
});

test("anotar después de deshacer descarta el futuro", () => {
  let h = deshacer(anotar(anotar(crear("a"), "b"), "c"));
  h = anotar(h, "d");
  assert.equal(h.presente, "d");
  assert.deepEqual(h.futuro, []);
  assert.deepEqual(h.pasado, ["a", "b"]);
});

test("guarda como máximo 50 pasos y pierde los más viejos", () => {
  let h = crear(0);
  for (let i = 1; i <= 60; i++) h = anotar(h, i);
  assert.equal(MAX_PASOS, 50);
  assert.equal(h.pasado.length, 50);
  assert.equal(h.pasado[0], 10);
  assert.equal(h.presente, 60);
});

test("anotar el mismo objeto no agrega paso", () => {
  const lista = [1];
  const h = crear(lista);
  assert.equal(anotar(h, lista), h);
});

test("deshacer sin pasado y rehacer sin futuro devuelven el mismo objeto", () => {
  const h = crear("a");
  assert.equal(deshacer(h), h);
  assert.equal(rehacer(h), h);
});
