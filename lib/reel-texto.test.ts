import test from "node:test";
import assert from "node:assert/strict";
import { medidasTexto } from "./reel-texto";

test("abajo y normal: lo mismo que antes del editor", () => {
  assert.deepEqual(medidasTexto("abajo", "normal", true), { centroY: 0.7, tamano: 0.058 });
  assert.deepEqual(medidasTexto("abajo", "normal", false), { centroY: 0.66, tamano: 0.058 });
});

test("arriba y grande", () => {
  assert.deepEqual(medidasTexto("arriba", "grande", true), { centroY: 0.2, tamano: 0.072 });
});

test("centro y chico", () => {
  assert.deepEqual(medidasTexto("centro", "chico", false), { centroY: 0.5, tamano: 0.046 });
});
