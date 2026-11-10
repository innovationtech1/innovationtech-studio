import { test } from "node:test";
import assert from "node:assert/strict";
import { claveAviso80, contadoresEnAviso, textoAviso80, textoPaquete } from "./aviso-uso";

const BASICO = { textos: 1000, imagenes: 300, voces: 0, subtitulos: 0, tomas_ia: 0 };

test("contadoresEnAviso: avisa al llegar al 80% de lo incluido", () => {
  assert.deepEqual(contadoresEnAviso({ textos: 800, imagenes: 10, voces: 0, subtitulos: 0, tomas_ia: 0 }, BASICO), ["textos"]);
});

test("contadoresEnAviso: 799 de 1000 todavía no avisa", () => {
  assert.deepEqual(contadoresEnAviso({ textos: 799, imagenes: 10, voces: 0, subtitulos: 0, tomas_ia: 0 }, BASICO), []);
});

test("contadoresEnAviso: un contador sin tope (0) nunca avisa, aunque tenga uso", () => {
  assert.deepEqual(contadoresEnAviso({ textos: 0, imagenes: 0, voces: 5, subtitulos: 5, tomas_ia: 0 }, BASICO), []);
});

test("contadoresEnAviso: varios contadores, en el orden de siempre; pasado del tope también cuenta", () => {
  const limites = { textos: 3000, imagenes: 1000, voces: 250, subtitulos: 250, tomas_ia: 0 };
  assert.deepEqual(
    contadoresEnAviso({ textos: 3000, imagenes: 100, voces: 260, subtitulos: 200, tomas_ia: 0 }, limites),
    ["textos", "voces", "subtitulos"],
  );
});

test("claveAviso80: una clave por mes y contador", () => {
  assert.equal(claveAviso80("2026-11", "imagenes"), "its-aviso-80-2026-11-imagenes");
});

test("textoAviso80: nombra el contador en palabras sencillas", () => {
  assert.equal(textoAviso80("textos"), "Ya usaste el 80% de tus mensajes y textos de este mes.");
  assert.equal(textoAviso80("subtitulos"), "Ya usaste el 80% de tus subtítulos de este mes.");
});

test("textoPaquete: el texto del botón con los valores por defecto", () => {
  assert.equal(
    textoPaquete("creativo", 5, { textos: 500, imagenes: 150 }),
    "Creativo · +500 textos y +150 imágenes · $5",
  );
  assert.equal(textoPaquete("voz", 9, { voces: 100, subtitulos: 100 }), "Voz · +100 voces y +100 subtítulos · $9");
});

test("textoPaquete: sigue lo que configure el admin (orden fijo, sin ceros)", () => {
  assert.equal(
    textoPaquete("creativo", 7, { imagenes: 200, textos: 600, voces: 0 }),
    "Creativo · +600 textos y +200 imágenes · $7",
  );
  assert.equal(
    textoPaquete("voz", 12, { textos: 10, voces: 100, subtitulos: 50 }),
    "Voz · +10 textos, +100 voces y +50 subtítulos · $12",
  );
});

test("textoPaquete y aviso del 80% para las tomas con IA", () => {
  assert.equal(textoPaquete("video", 15, { tomas_ia: 20 }), "Video · +20 tomas con IA · $15");
  assert.equal(textoAviso80("tomas_ia"), "Ya usaste el 80% de tus tomas con IA de este mes.");
  assert.deepEqual(
    contadoresEnAviso({ textos: 0, imagenes: 0, voces: 0, subtitulos: 0, tomas_ia: 16 }, { textos: 1, imagenes: 1, voces: 1, subtitulos: 1, tomas_ia: 20 }),
    ["tomas_ia"],
  );
});
