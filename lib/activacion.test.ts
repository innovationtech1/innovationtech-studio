import { test } from "node:test";
import assert from "node:assert/strict";
import { codigoDe, codigoValido, enlaceActivacion, enlaceCashApp, enlaceWhatsAppActivacion, limpiarCodigo, mostrarCodigo } from "./activacion";

test("limpiarCodigo y mostrarCodigo: sin guiones para guardar, con guion para leer", () => {
  assert.equal(limpiarCodigo(" abcd-2345 "), "ABCD2345");
  assert.equal(mostrarCodigo("abcd2345"), "ABCD-2345");
  assert.equal(mostrarCodigo("AB"), "AB");
});

test("codigoValido: ocho caracteres y sin los que se confunden", () => {
  assert.equal(codigoValido("ABCD2345"), true);
  assert.equal(codigoValido("ABCD234"), false);
  assert.equal(codigoValido("ABCD23456"), false);
  assert.equal(codigoValido("ABCD0345"), false); // el cero se confunde con la O
  assert.equal(codigoValido("ABCI2345"), false); // la I se confunde con el 1
});

test("codigoDe: lee el código del enlace de la tarjeta o del texto escrito", () => {
  assert.equal(codigoDe("https://innovationtech-studio.netlify.app/activar?c=ABCD2345"), "ABCD2345");
  assert.equal(codigoDe("https://innovationtech-studio.netlify.app/activar?c=abcd-2345&x=1"), "ABCD2345");
  assert.equal(codigoDe("abcd 2345"), "ABCD2345");
  assert.equal(codigoDe("https://ejemplo.com/otra-cosa"), null);
  assert.equal(codigoDe("hola"), null);
  assert.equal(codigoDe(""), null);
});

test("enlaceActivacion: el enlace que se graba en la tarjeta se vuelve a leer igual", () => {
  const enlace = enlaceActivacion("https://innovationtech-studio.netlify.app/", "abcd-2345");
  assert.equal(enlace, "https://innovationtech-studio.netlify.app/activar?c=ABCD2345");
  assert.equal(codigoDe(enlace), "ABCD2345");
});

test("enlaceCashApp: solo con un cashtag bien escrito", () => {
  assert.equal(enlaceCashApp("$MiNegocio"), "https://cash.app/$MiNegocio");
  assert.equal(enlaceCashApp("MiNegocio"), "https://cash.app/$MiNegocio");
  assert.equal(enlaceCashApp(undefined), null);
  assert.equal(enlaceCashApp(""), null);
  assert.equal(enlaceCashApp("mal escrito/"), null);
});

test("enlaceWhatsAppActivacion: abre WhatsApp con el código ya escrito", () => {
  const enlace = enlaceWhatsAppActivacion("ABCD2345");
  assert.match(enlace, /^https:\/\/wa\.me\/12109900532\?text=/);
  assert.match(decodeURIComponent(enlace), /ABCD-2345/);
});
