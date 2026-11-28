import { test } from "node:test";
import assert from "node:assert/strict";
import { PREGUNTA_FOTO, mensajeConFoto, temaConFoto } from "./foto-contexto";
import { instruccionesNova } from "./nova";

test("mensajeConFoto: el mensaje del chat lleva al final lo que se ve en la foto", () => {
  assert.equal(mensajeConFoto("Escríbeme un post", "Una torta sobre la mesa"), "Escríbeme un post\n\n(Foto adjunta: Una torta sobre la mesa)");
});

test("mensajeConFoto: con foto y sin texto, se pregunta qué publicar con ella", () => {
  assert.equal(mensajeConFoto("   ", "Una torta sobre la mesa"), `${PREGUNTA_FOTO}\n\n(Foto adjunta: Una torta sobre la mesa)`);
});

test("mensajeConFoto: si la foto no se pudo ver, NOVA se entera para pedir que se la describan", () => {
  assert.equal(mensajeConFoto("Escríbeme un post", null), "Escríbeme un post\n\n(Foto adjunta: no se pudo ver)");
  assert.equal(mensajeConFoto("Escríbeme un post", "  "), "Escríbeme un post\n\n(Foto adjunta: no se pudo ver)");
});

test("temaConFoto: en Textos la descripción de la foto se suma al tema; si no se pudo ver, el tema queda igual", () => {
  assert.equal(temaConFoto("Promo 2x1 los martes", "Una torta sobre la mesa"), "Promo 2x1 los martes\nEn la foto que acompaña la publicación se ve: Una torta sobre la mesa.");
  assert.equal(temaConFoto("Promo 2x1 los martes", null), "Promo 2x1 los martes");
  assert.equal(temaConFoto("", "Una torta sobre la mesa"), "Escribe una publicación para esta foto.\nEn la foto que acompaña la publicación se ve: Una torta sobre la mesa.");
  assert.equal(temaConFoto("", null), "");
});

test("instruccionesNova: NOVA sabe usar la foto adjunta y ya no dice que no puede ver imágenes", () => {
  const t = instruccionesNova({ english: false, cuenta: null, cuentasOn: false });
  assert.match(t, /\(Foto adjunta: …\)/);
  assert.match(t, /no digas que no puedes ver/i);
  assert.match(t, /no se pudo ver/);
});
