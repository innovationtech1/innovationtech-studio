import test from "node:test";
import assert from "node:assert/strict";
import { MOVIMIENTOS, movimientoAlAzar } from "./movimientos";

test("movimientos: una docena de opciones con nombre corto y descripción que cabe en el campo", () => {
  assert.ok(MOVIMIENTOS.length >= 10 && MOVIMIENTOS.length <= 14);
  assert.equal(new Set(MOVIMIENTOS.map((m) => m.id)).size, MOVIMIENTOS.length);
  assert.equal(new Set(MOVIMIENTOS.map((m) => m.nombre)).size, MOVIMIENTOS.length);
  for (const m of MOVIMIENTOS) {
    assert.ok(m.nombre.length > 0 && m.nombre.length <= 18, m.nombre);
    assert.ok(m.texto.length >= 20 && m.texto.length <= 300, m.id);
  }
});

test("al azar: combina cámara, ambiente y luz en una frase que cabe en el campo", () => {
  const t = movimientoAlAzar("", () => 0);
  assert.ok(t.length > 40 && t.length <= 300);
  assert.equal(movimientoAlAzar("", () => 0), t); // mismo azar, mismo resultado
  assert.notEqual(movimientoAlAzar("", () => 0.99), t);
});

test("al azar: nunca repite el que ya está puesto", () => {
  const t = movimientoAlAzar("", () => 0);
  assert.notEqual(movimientoAlAzar(t, () => 0), t);
});

test("al azar: con el azar de verdad siempre devuelve algo válido", () => {
  for (let i = 0; i < 50; i++) {
    const t = movimientoAlAzar("");
    assert.ok(t.length > 40 && t.length <= 300);
  }
});
