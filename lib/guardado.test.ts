import { test } from "node:test";
import assert from "node:assert/strict";
import { guardarConfirmado } from "./guardado";
import { nuevoClip, ponerEnLibre } from "./linea-tiempo";

const disco = (falla = false) => {
  const archivos = new Map<string, Blob>();
  return {
    archivos,
    poner: async (id: string, b: Blob) => {
      if (falla) throw new Error("Sin espacio en el dispositivo.");
      archivos.set(id, b);
    },
    quitar: async (id: string) => void archivos.delete(id),
  };
};
const blob = new Blob(["x"]);

test("guardarConfirmado: si se escribió y sigue vigente, responde ok y el archivo queda", async () => {
  const d = disco();
  assert.equal(await guardarConfirmado({ id: "a", blob, ...d, vigente: () => true }), "ok");
  assert.ok(d.archivos.has("a"));
});

test("guardarConfirmado: sin espacio responde fallo y no deja nada", async () => {
  const d = disco(true);
  assert.equal(await guardarConfirmado({ id: "a", blob, ...d, vigente: () => true }), "fallo");
  assert.equal(d.archivos.size, 0);
});

test("guardarConfirmado: si no se pudo leer el archivo (blob nulo) responde fallo", async () => {
  const d = disco();
  assert.equal(await guardarConfirmado({ id: "a", blob: null, ...d, vigente: () => true }), "fallo");
});

test("guardarConfirmado: si mientras se guardaba ya se cambió por otro, borra lo recién escrito (sin huérfanos)", async () => {
  const d = disco();
  assert.equal(await guardarConfirmado({ id: "a", blob, ...d, vigente: () => false }), "cambio");
  assert.equal(d.archivos.size, 0);
});

test("ponerEnLibre: la imagen va al primer clip vacío", () => {
  const clips = [nuevoClip({ image: "foto1" }), nuevoClip(), nuevoClip()];
  const r = ponerEnLibre(clips, "nueva");
  assert.deepEqual(r.map((c) => c.image), ["foto1", "nueva", ""]);
});

test("ponerEnLibre: un clip con foto guardada que aún no se recupera NO está libre", () => {
  const clips = [nuevoClip({ image: "", imageId: "reel-abc" }), nuevoClip()];
  const r = ponerEnLibre(clips, "nueva");
  assert.equal(r[0].image, "");
  assert.equal(r[0].imageId, "reel-abc");
  assert.equal(r[1].image, "nueva");
});

test("ponerEnLibre: si no hay clip libre, se agrega uno al final", () => {
  const clips = [nuevoClip({ image: "", imageId: "reel-abc" }), nuevoClip({ image: "foto" })];
  const r = ponerEnLibre(clips, "nueva");
  assert.equal(r.length, 3);
  assert.equal(r[2].image, "nueva");
});

test("ponerEnLibre: un clip de video no se usa como libre", () => {
  const clips = [nuevoClip({ tipo: "video", archivoId: "reelvid-1", image: "" }), nuevoClip()];
  const r = ponerEnLibre(clips, "nueva");
  assert.equal(r[0].image, "");
  assert.equal(r[1].image, "nueva");
});
