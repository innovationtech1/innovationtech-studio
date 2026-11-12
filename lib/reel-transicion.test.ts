import test from "node:test";
import assert from "node:assert/strict";
import { GRUPOS_TRANSICION, SEGUNDOS_TRANSICION, TRANSICIONES, duracionTransicion, esDuracionTransicion, esTransicion, repartirAlAzar, suave } from "./reel-transicion";

test("catálogo: 25 transiciones en 6 grupos, sin repetir y con nombre e icono", () => {
  assert.deepEqual(GRUPOS_TRANSICION.map((g) => g.id), ["basicas", "movimiento", "formas", "zoom", "efectos", "exclusiva"]);
  assert.equal(TRANSICIONES.length, 25);
  assert.equal(new Set(TRANSICIONES.map((t) => t.id)).size, 25);
  assert.equal(new Set(TRANSICIONES.map((t) => t.nombre)).size, 25);
  assert.ok(TRANSICIONES.every((t) => t.nombre.length > 0 && t.nombre.length <= 22 && t.icono.length > 0));
  assert.deepEqual(GRUPOS_TRANSICION.flatMap((g) => g.transiciones), TRANSICIONES);
});

test("las seis de siempre siguen existiendo con el mismo nombre interno", () => {
  for (const id of ["fundido", "corte", "deslizar", "zoom", "destello", "barrido"]) assert.ok(esTransicion(id), id);
  assert.equal(esTransicion("explosión"), false);
  assert.equal(esTransicion(undefined), false);
});

test("la exclusiva es la ráfaga de marca", () => {
  assert.deepEqual(GRUPOS_TRANSICION.find((g) => g.id === "exclusiva")!.transiciones.map((t) => t.id), ["rafaga"]);
});

test("duraciones: rápida, normal y lenta; nunca más de un tercio del clip", () => {
  assert.deepEqual(SEGUNDOS_TRANSICION, { rapida: 0.3, normal: 0.6, lenta: 1 });
  assert.equal(duracionTransicion("normal", 8), 0.6);
  assert.equal(duracionTransicion("lenta", 8), 1);
  assert.equal(duracionTransicion("rapida", 8), 0.3);
  assert.equal(duracionTransicion("lenta", 1.5), 0.5);
  assert.equal(duracionTransicion(undefined, 8), 0.6);
  assert.ok(esDuracionTransicion("lenta") && !esDuracionTransicion("eterna"));
});

test("suave: empieza en 0, termina en 1 y se acota", () => {
  assert.equal(suave(0), 0);
  assert.equal(suave(1), 1);
  assert.equal(suave(0.5), 0.5);
  assert.equal(suave(-3), 0);
  assert.equal(suave(9), 1);
  assert.ok(suave(0.25) < 0.25 && suave(0.75) > 0.75);
});

test("repartirAlAzar: una por clip, sin dos iguales seguidas y sin cortes secos", () => {
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280), semilla / 233280);
  const r = repartirAlAzar(40, azar);
  assert.equal(r.length, 40);
  assert.ok(r.every((t) => esTransicion(t) && t !== "corte"));
  for (let i = 1; i < r.length; i++) assert.notEqual(r[i], r[i - 1]);
  assert.ok(new Set(r).size >= 8); // variadas de verdad
  assert.deepEqual(repartirAlAzar(0), []);
  assert.equal(repartirAlAzar(1, () => 0).length, 1);
  // con el azar atascado en el mismo valor tampoco repite
  const fijo = repartirAlAzar(5, () => 0.5);
  for (let i = 1; i < fijo.length; i++) assert.notEqual(fijo[i], fijo[i - 1]);
});
