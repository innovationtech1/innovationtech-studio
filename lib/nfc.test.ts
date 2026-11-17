import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSULTA_GOOGLE_PAY, mostrarVerificarNfc, revisionNfc, revisionPagoSinContacto } from "./nfc";

test("revisionNfc: cada resultado se explica en palabras claras", () => {
  assert.equal(revisionNfc("ok").ok, true);
  assert.match(revisionNfc("SinSoporte").help ?? "", /Chrome en un celular Android/);
  assert.match(revisionNfc("NotAllowedError").label, /permiso/);
  assert.match(revisionNfc("NotReadableError").label, /apagado/);
  assert.match(revisionNfc("NotSupportedError").label, /no tiene NFC/);
  assert.equal(revisionNfc("OtraCosa").ok, false);
});

test("revisionPagoSinContacto: listo, sin billetera o sin poder revisar", () => {
  assert.equal(revisionPagoSinContacto("si").ok, true);
  assert.match(revisionPagoSinContacto("no").label, /No hay billetera/);
  assert.equal(revisionPagoSinContacto("SinSoporte").ok, false);
  assert.equal(revisionPagoSinContacto("error").ok, false);
});

test("CONSULTA_GOOGLE_PAY: pregunta por Google Pay en modo de prueba", () => {
  assert.equal(CONSULTA_GOOGLE_PAY.supportedMethods, "https://google.com/pay");
  assert.equal(CONSULTA_GOOGLE_PAY.data.environment, "TEST");
});

test("mostrarVerificarNfc: solo celulares y tabletas con NFC para páginas", () => {
  const android = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
  const tableta = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
  const compu = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
  assert.equal(mostrarVerificarNfc({ tieneNfc: true, agente: android }), true);
  assert.equal(mostrarVerificarNfc({ tieneNfc: true, agente: tableta }), true);
  assert.equal(mostrarVerificarNfc({ tieneNfc: true, agente: compu, movil: true }), true);
  // Sin NFC para páginas no aparece, aunque sea un celular
  assert.equal(mostrarVerificarNfc({ tieneNfc: false, agente: android }), false);
  assert.equal(mostrarVerificarNfc({ tieneNfc: false, agente: iphone }), false);
  // En computadora no aparece
  assert.equal(mostrarVerificarNfc({ tieneNfc: true, agente: compu }), false);
  assert.equal(mostrarVerificarNfc({ tieneNfc: false, agente: compu }), false);
});
