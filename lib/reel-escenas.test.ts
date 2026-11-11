import { test } from "node:test";
import assert from "node:assert/strict";
import { DURACIONES, SEGUNDOS_TOMA, duracionMinima, duracionPara, maxFotos, planDeEscenas, repartirEscenas } from "./reel-escenas";

const suma = (e: { segundos: number }[]) => e.reduce((a, x) => a + x.segundos, 0);
const casi = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("sin tomas: las fotos se reparten parejo y suman la duración", () => {
  const e = repartirEscenas(15, 4, []);
  assert.deepEqual(e.map((x) => x.tipo), ["foto", "foto", "foto", "foto"]);
  assert.deepEqual(e.map((x) => x.indice), [0, 1, 2, 3]);
  casi(suma(e), 15);
  casi(e[0].segundos, 3.75);
});

test("con 1 y 2 tomas: cada toma dura 5 s y el resto se reparte entre las demás fotos", () => {
  const una = repartirEscenas(20, 4, [2]);
  assert.deepEqual(una.map((x) => x.tipo), ["foto", "foto", "toma", "foto"]);
  assert.equal(una[2].segundos, SEGUNDOS_TOMA);
  casi(una[0].segundos, 5);
  casi(suma(una), 20);
  const dos = repartirEscenas(30, 5, [0, 4]);
  assert.deepEqual(dos.map((x) => x.tipo), ["toma", "foto", "foto", "foto", "toma"]);
  casi(dos[1].segundos, 20 / 3);
  casi(suma(dos), 30);
});

test("sumas exactas en todas las duraciones", () => {
  for (const d of DURACIONES) for (const fotos of [1, 2, 3, 5, 6]) for (const tomas of [[], [0]]) {
    try {
      casi(suma(repartirEscenas(d, fotos, tomas)), d);
    } catch (e) {
      assert.match((e as Error).message, /foto/i); // solo se vale el error claro de «no caben» / «faltan fotos»
    }
  }
});

test("mínimo 1.5 s por foto: más fotos de las que caben → error claro", () => {
  assert.equal(maxFotos(10, 0), 6);
  assert.equal(maxFotos(10, 1), 4); // 1 toma + 3 fotos (5 s / 1.5)
  assert.equal(repartirEscenas(10, 6, []).length, 6);
  assert.throws(() => repartirEscenas(10, 7, []), /En 10 s caben máximo 6 fotos\. Quita fotos o elige un video más largo\./);
  assert.throws(() => repartirEscenas(10, 5, [0]), /caben máximo 4 fotos/);
});

test("solo fotos con IA: deben llenar justo la duración", () => {
  const e = repartirEscenas(10, 2, [0, 1]);
  assert.deepEqual(e.map((x) => x.segundos), [5, 5]);
  assert.throws(() => repartirEscenas(15, 2, [0, 1]), /Agrega al menos una foto sin IA/);
  assert.throws(() => repartirEscenas(10, 1, [0]), /Agrega al menos una foto sin IA/);
});

test("tomas inválidas: más de 2, repetidas, fuera de rango o sin fotos", () => {
  assert.throws(() => repartirEscenas(30, 6, [0, 1, 2, 3, 4]), /máximo 4/);
  assert.equal(repartirEscenas(30, 5, [0, 1, 2, 3]).filter((e) => e.tipo === "toma").length, 4);
  assert.throws(() => repartirEscenas(30, 5, [1, 1]));
  assert.throws(() => repartirEscenas(30, 5, [5]));
  assert.throws(() => repartirEscenas(10, 0, []), /al menos una/);
});

test("planDeEscenas: deja 3 s de cierre con la marca si caben; si no, el video va sin cierre", () => {
  const con = planDeEscenas(15, 3, [0], 3);
  assert.equal(con.cierre, 3);
  casi(suma(con.escenas), 12);
  const sin = planDeEscenas(10, 2, [0, 1], 3);
  assert.equal(sin.cierre, 0);
  casi(suma(sin.escenas), 10);
  const justo = planDeEscenas(10, 6, [], 3); // 6 fotos necesitan 9 s: no cabe el cierre
  assert.equal(justo.cierre, 0);
  casi(suma(justo.escenas), 10);
});

test("duracionMinima: la duración más corta donde caben las fotos y las tomas (con o sin cierre)", () => {
  assert.equal(duracionMinima(2, 1, 3), 10); // 5 de toma + foto + cierre
  assert.equal(duracionMinima(2, 2, 3), 10); // dos tomas llenan justo 10 s (sin cierre)
  assert.equal(duracionMinima(3, 3, 3), 15);
  assert.equal(duracionMinima(4, 3, 3), 20); // 15 de tomas + 1 foto (+ cierre)
  assert.equal(duracionMinima(4, 4, 3), 20);
  assert.equal(duracionMinima(6, 4, 3), 30);
  assert.equal(duracionMinima(20, 4, 3), null); // no cabe en ninguna
});

test("duracionPara: respeta la elegida si caben; si no (o si es automática), usa la más corta donde caben", () => {
  assert.equal(duracionPara(0, 2, 1, 3), 10);
  assert.equal(duracionPara(20, 2, 1, 3), 20);
  assert.equal(duracionPara(10, 4, 3, 3), 20);
  assert.throws(() => duracionPara(0, 30, 2, 3), /caben máximo/);
});
