import { test } from "node:test";
import assert from "node:assert/strict";
import { firmaTomas, terminado, textoEstado } from "./estados-video";

test("subida y vista previa", () => {
  assert.equal(textoEstado({ tipo: "subiendo", pct: 42.4 }), "Subiendo… 42%");
  assert.equal(textoEstado({ tipo: "subiendo", pct: 140 }), "Subiendo… 100%");
  assert.equal(textoEstado({ tipo: "previa" }), "Vista previa lista");
});

test("en fila: muestra el mejor lugar", () => {
  const f = { tipo: "trabajos", topeHoy: false, trabajos: [{ id: "a", estado: "en_fila", lugar: 4 }, { id: "b", estado: "en_fila", lugar: 5 }] } as const;
  assert.equal(textoEstado(f), "En fila, lugar 4");
});

test("generando: toma X de Y", () => {
  assert.equal(textoEstado({ tipo: "trabajos", topeHoy: false, trabajos: [{ id: "a", estado: "enviado" }, { id: "b", estado: "en_fila", lugar: 1 }] }), "Toma 1 de 2 · Generando…");
  assert.equal(textoEstado({ tipo: "trabajos", topeHoy: false, trabajos: [{ id: "a", estado: "listo" }, { id: "b", estado: "enviado" }] }), "Toma 2 de 2 · Generando…");
});

test("listo, listo al instante (todo de caché) y fallo con crédito devuelto", () => {
  assert.equal(textoEstado({ tipo: "trabajos", topeHoy: false, trabajos: [{ id: "a", estado: "listo" }, { id: "b", estado: "listo", desdeCache: true }] }), "Listo");
  assert.equal(textoEstado({ tipo: "trabajos", topeHoy: false, trabajos: [{ id: "a", estado: "listo", desdeCache: true }] }), "Listo al instante");
  assert.equal(
    textoEstado({ tipo: "trabajos", topeHoy: false, trabajos: [{ id: "a", estado: "listo" }, { id: "b", estado: "fallo" }] }),
    "No se pudo generar la toma, te devolvimos tu crédito",
  );
});

test("tope del día: solo si todavía hay tomas en fila", () => {
  assert.equal(textoEstado({ tipo: "trabajos", topeHoy: true, trabajos: [{ id: "a", estado: "en_fila", lugar: 1 }] }), "Hoy ya no hay cupo; tu video se genera mañana");
  assert.equal(textoEstado({ tipo: "trabajos", topeHoy: true, trabajos: [{ id: "a", estado: "enviado" }] }), "Toma 1 de 1 · Generando…");
});

test("terminado: todas listas o fallidas", () => {
  assert.equal(terminado([{ id: "a", estado: "listo" }, { id: "b", estado: "fallo" }]), true);
  assert.equal(terminado([{ id: "a", estado: "listo" }, { id: "b", estado: "enviado" }]), false);
  assert.equal(terminado([]), false);
});

test("firmaTomas: misma foto y movimiento dan la misma firma (para retomar sin cobrar de nuevo)", () => {
  assert.equal(firmaTomas([{ sha256: "aa", movimiento: " Zoom  lento" }]), firmaTomas([{ sha256: "aa", movimiento: "zoom lento " }]));
  assert.notEqual(firmaTomas([{ sha256: "aa", movimiento: "zoom" }]), firmaTomas([{ sha256: "ab", movimiento: "zoom" }]));
});
