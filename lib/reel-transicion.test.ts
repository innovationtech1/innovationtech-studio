import test from "node:test";
import assert from "node:assert/strict";
import { TRANSICIONES, pasoTransicion } from "./reel-transicion";

const quieto = { alfa: 0, dx: 0, escala: 1, recorte: 1, blanco: 0 };

test("hay seis transiciones, con nombre", () => {
  assert.deepEqual(TRANSICIONES.map((t) => t.id), ["fundido", "corte", "deslizar", "zoom", "destello", "barrido"]);
  assert.ok(TRANSICIONES.every((t) => t.nombre.length > 0));
});

test("fundido: el clip siguiente aparece poco a poco", () => {
  assert.deepEqual(pasoTransicion("fundido", 0), quieto);
  assert.deepEqual(pasoTransicion("fundido", 0.5), { ...quieto, alfa: 0.5 });
  assert.deepEqual(pasoTransicion("fundido", 1), { ...quieto, alfa: 1 });
});

test("corte: nunca se encima el siguiente", () => {
  for (const p of [0, 0.5, 0.99, 1]) assert.deepEqual(pasoTransicion("corte", p), quieto);
});

test("deslizar: el siguiente entra desde la derecha", () => {
  assert.deepEqual(pasoTransicion("deslizar", 0), { ...quieto, alfa: 1, dx: 1 });
  assert.equal(pasoTransicion("deslizar", 1).dx, 0);
  const m = pasoTransicion("deslizar", 0.5);
  assert.ok(m.dx > 0 && m.dx < 0.5); // desacelera al llegar
});

test("zoom: el siguiente aparece acercándose", () => {
  assert.deepEqual(pasoTransicion("zoom", 0), { ...quieto, alfa: 0, escala: 1.3 });
  assert.deepEqual(pasoTransicion("zoom", 1), { ...quieto, alfa: 1, escala: 1 });
});

test("destello: blanco al máximo a la mitad y el siguiente aparece ahí", () => {
  assert.equal(pasoTransicion("destello", 0).blanco, 0);
  assert.equal(pasoTransicion("destello", 0.5).blanco, 1);
  assert.equal(pasoTransicion("destello", 1).blanco, 0);
  assert.equal(pasoTransicion("destello", 0.4).alfa, 0);
  assert.equal(pasoTransicion("destello", 0.6).alfa, 1);
});

test("barrido: el siguiente se descubre de izquierda a derecha", () => {
  assert.deepEqual(pasoTransicion("barrido", 0.25), { ...quieto, alfa: 1, recorte: 0.25 });
  assert.equal(pasoTransicion("barrido", 1).recorte, 1);
});

test("fuera de rango se acota", () => {
  assert.deepEqual(pasoTransicion("fundido", -1), quieto);
  assert.equal(pasoTransicion("fundido", 3).alfa, 1);
});
