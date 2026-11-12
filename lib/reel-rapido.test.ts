import test from "node:test";
import assert from "node:assert/strict";
import { FPS_RAPIDO, codecDeVideo, cuadrosDe, momentoDe, sirveParaRapido, trozosDeAudio } from "./reel-rapido";

test("sirveParaRapido: solo los videos hechos de fotos", () => {
  assert.equal(sirveParaRapido([{ segundos: 3 }, { segundos: 8 }]), true);
  assert.equal(sirveParaRapido([{ segundos: 3 }, { segundos: 5, video: { src: "x" } }]), false);
  assert.equal(sirveParaRapido([]), false);
});

test("cuadrosDe y momentoDe: 30 cuadros por segundo, sin pasarse del final", () => {
  assert.equal(FPS_RAPIDO, 30);
  assert.equal(cuadrosDe(10), 300);
  assert.equal(cuadrosDe(7.02), 211);
  assert.equal(cuadrosDe(0), 1);
  assert.equal(momentoDe(0), 0);
  assert.equal(momentoDe(30), 1);
  assert.equal(Math.round(momentoDe(45) * 1e6), 1_500_000);
});

test("codecDeVideo: el nivel de H.264 alcanza para el tamaño del video", () => {
  assert.equal(codecDeVideo(720, 1280), "avc1.42E01F"); // vertical y horizontal: nivel 3.1
  assert.equal(codecDeVideo(1280, 720), "avc1.42E01F");
  assert.equal(codecDeVideo(1080, 1080), "avc1.42E028"); // cuadrado: más pixeles, nivel 4.0
});

test("trozosDeAudio: parte el audio en bloques sin perder ni repetir muestras", () => {
  assert.deepEqual(trozosDeAudio(10, 4), [
    { desde: 0, cuantas: 4 },
    { desde: 4, cuantas: 4 },
    { desde: 8, cuantas: 2 },
  ]);
  assert.deepEqual(trozosDeAudio(0, 4), []);
  const t = trozosDeAudio(44100 * 7 + 13, 4096);
  assert.equal(t.reduce((a, x) => a + x.cuantas, 0), 44100 * 7 + 13);
});
