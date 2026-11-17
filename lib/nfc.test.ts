import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSULTA_GOOGLE_PAY, revisionNfc, revisionPagoSinContacto } from "./nfc";

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
