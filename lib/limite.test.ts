import { test } from "node:test";
import assert from "node:assert/strict";
import { conLimite } from "./limite";
import { nuevoClip, sinFuente } from "./linea-tiempo";

test("conLimite: si termina a tiempo devuelve su resultado", async () => {
  assert.equal(await conLimite(Promise.resolve(7), 50, "tarde"), 7);
});

test("conLimite: si no termina, falla con el mensaje dado (no se queda colgado)", async () => {
  await assert.rejects(conLimite(new Promise(() => {}), 20, "El video tardó demasiado en abrir."), /tardó demasiado/);
});

test("conLimite: con valor de respaldo no falla, lo devuelve", async () => {
  assert.equal(await conLimite(new Promise<string>(() => {}), 20, null, "respaldo"), "respaldo");
});

test("conLimite: un fallo propio se respeta", async () => {
  await assert.rejects(conLimite(Promise.reject(new Error("roto")), 50, "tarde"), /roto/);
});

test("sinFuente: nada falta cuando cada video y cada toma tienen su archivo", () => {
  const clips = [
    nuevoClip({ id: "a", image: "f" }),
    nuevoClip({ id: "b", tipo: "video", archivoId: "reelvid-1", image: "p", duracionOriginal: 5 }),
    nuevoClip({ id: "c", tipo: "toma", image: "f", trabajoId: "t1" }),
  ];
  assert.deepEqual(sinFuente(clips, { tomas: { c: "https://x/clip.mp4" }, videos: { "reelvid-1": "blob:1" } }), { videos: [], tomas: [] });
});

test("sinFuente: dice qué clips de video no tienen su archivo (número de clip, desde 1)", () => {
  const clips = [nuevoClip({ id: "a", image: "f" }), nuevoClip({ id: "b", tipo: "video", archivoId: "reelvid-1", image: "p", duracionOriginal: 5 })];
  assert.deepEqual(sinFuente(clips, { tomas: {}, videos: {} }).videos, [2]);
});

test("sinFuente: dice qué tomas ya generadas no se pudieron traer; las que nunca se animaron no cuentan", () => {
  const clips = [
    nuevoClip({ id: "a", tipo: "toma", image: "f", trabajoId: "t1" }),
    nuevoClip({ id: "b", tipo: "toma", image: "f" }),
  ];
  assert.deepEqual(sinFuente(clips, { tomas: { a: null }, videos: {} }).tomas, [1]);
});
