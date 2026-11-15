import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_TROZO_VOZ, sinEtiquetaId3, trozosDeGuion, unirMp3 } from "./voz-trozos";

test("trozosDeGuion: un guion corto va en un solo trozo, tal cual", () => {
  assert.deepEqual(trozosDeGuion("Hola. Ven por tu torta."), ["Hola. Ven por tu torta."]);
});

test("trozosDeGuion: un guion largo se parte por oraciones, sin pasar del tope y sin perder texto", () => {
  const oracion = "Esta semana tenemos dos tortas por el precio de una en todas las sucursales. ";
  const guion = oracion.repeat(20).trim();
  const t = trozosDeGuion(guion);
  assert.ok(t.length > 1);
  for (const x of t) assert.ok(x.length <= MAX_TROZO_VOZ, `trozo de ${x.length}`);
  for (const x of t) assert.match(x, /[.!?]$/); // cada trozo termina en una oración completa
  assert.equal(t.join(" "), guion);
});

test("trozosDeGuion: respeta signos en español y saltos de línea", () => {
  const guion = ("¿Tienes hambre? ¡Ven hoy!\n".repeat(30)).trim();
  const t = trozosDeGuion(guion);
  assert.ok(t.length > 1);
  assert.equal(t.join(" ").replace(/\s+/g, " "), guion.replace(/\s+/g, " "));
});

test("trozosDeGuion: una oración más larga que el tope se parte por comas o espacios, nunca a media palabra", () => {
  const larga = Array.from({ length: 200 }, (_, i) => `palabra${i}`).join(" ") + ".";
  const t = trozosDeGuion(larga);
  for (const x of t) assert.ok(x.length <= MAX_TROZO_VOZ);
  assert.equal(t.join(" "), larga);
});

test("trozosDeGuion: nunca devuelve trozos vacíos y limita la cantidad", () => {
  assert.deepEqual(trozosDeGuion("   "), []);
  const t = trozosDeGuion("Hola. ".repeat(2000));
  assert.ok(t.every((x) => x.trim().length > 0));
  assert.ok(t.length <= 8);
});

test("sinEtiquetaId3: quita la etiqueta ID3 del inicio y deja el audio", () => {
  const audio = Buffer.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3]);
  // «ID3», versión 4.0, banderas 0, tamaño 5 (en 4 bytes de 7 bits) + 5 bytes de etiqueta
  const etiqueta = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 5, 9, 9, 9, 9, 9]);
  assert.deepEqual(sinEtiquetaId3(Buffer.concat([etiqueta, audio])), audio);
  assert.deepEqual(sinEtiquetaId3(audio), audio); // sin etiqueta no cambia
  assert.deepEqual(sinEtiquetaId3(Buffer.from([0x49, 0x44, 0x33])), Buffer.from([0x49, 0x44, 0x33])); // demasiado corto: se deja
});

test("unirMp3: une los audios en orden; solo el primero conserva su etiqueta", () => {
  const etiqueta = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 2, 7, 7]);
  const a = Buffer.concat([etiqueta, Buffer.from([0xff, 0xfb, 1])]);
  const b = Buffer.concat([etiqueta, Buffer.from([0xff, 0xfb, 2])]);
  assert.deepEqual(unirMp3([a, b]), Buffer.concat([a, Buffer.from([0xff, 0xfb, 2])]));
});
