import { test } from "node:test";
import assert from "node:assert/strict";
import { TAMANOS_GALERIA, anchoMinimo, avisoDeGaleria, limpiarTamano } from "./galeria-vista";

const GB = 1024 * 1024 * 1024;

test("TAMANOS_GALERIA: chico, mediano y grande, cada uno con miniaturas más anchas que el anterior", () => {
  assert.deepEqual([...TAMANOS_GALERIA], ["chico", "mediano", "grande"]);
  assert.ok(anchoMinimo("chico") < anchoMinimo("mediano"));
  assert.ok(anchoMinimo("mediano") < anchoMinimo("grande"));
  assert.ok(anchoMinimo("chico") >= 88, "en teléfono deben caber al menos 3 por fila sin quedar diminutas");
});

test("limpiarTamano: lo guardado que no sirve vuelve a mediano", () => {
  assert.equal(limpiarTamano("chico"), "chico");
  assert.equal(limpiarTamano("grande"), "grande");
  assert.equal(limpiarTamano("enorme"), "mediano");
  assert.equal(limpiarTamano(null), "mediano");
});

test("avisoDeGaleria: sin espacio de verdad (Studio ya ocupa casi todo lo que el navegador le da)", () => {
  const e = Object.assign(new Error("x"), { name: "QuotaExceededError" });
  const t = avisoDeGaleria(e, { used: 9.5 * GB, quota: 10 * GB });
  assert.match(t, /sin espacio/);
  assert.match(t, /Borra/);
});

test("avisoDeGaleria: el navegador dice «sin espacio» pero a Studio le sobra: el lleno es el disco del aparato", () => {
  const e = Object.assign(new Error("x"), { name: "QuotaExceededError" });
  const t = avisoDeGaleria(e, { used: 0.3 * GB, quota: 10.3 * GB });
  assert.match(t, /disco/);
  assert.match(t, /Descarga/);
  assert.doesNotMatch(t, /Borra algunos elementos/); // borrar de la galería no lo arregla
});

test("avisoDeGaleria: cualquier otro fallo no se le achaca al espacio", () => {
  const t = avisoDeGaleria(Object.assign(new Error("x"), { name: "DataCloneError" }), { used: 0.3 * GB, quota: 10 * GB });
  assert.doesNotMatch(t, /sin espacio|disco/);
  assert.match(t, /Descarga/);
  assert.match(avisoDeGaleria(null, null), /Descarga/);
});

test("anchoMinimo: en un teléfono angosto (300 px útiles) caben 3 chicas, 2 medianas y 1 grande", () => {
  const caben = (min: number, hueco: number) => Math.floor((300 + hueco) / (min + hueco));
  assert.equal(caben(anchoMinimo("chico"), 6), 3);
  assert.equal(caben(anchoMinimo("mediano"), 10), 2);
  assert.equal(caben(anchoMinimo("grande"), 14), 1);
});
