import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeCamara, tamanoCaptura } from "./camara";

test("mensajeCamara: cada problema de la cámara se explica en palabras claras", () => {
  assert.match(mensajeCamara("NotAllowedError"), /Permite el uso de la cámara/);
  assert.match(mensajeCamara("NotFoundError"), /No encontramos una cámara/);
  assert.match(mensajeCamara("NotReadableError"), /otra aplicación/);
  assert.match(mensajeCamara("OverconstrainedError"), /No encontramos una cámara/);
  assert.match(mensajeCamara("SinSoporte"), /no permite usar la cámara/);
  assert.match(mensajeCamara("OtraCosa"), /No se pudo abrir la cámara/);
});

test("tamanoCaptura: reduce al lado máximo sin deformar y nunca agranda", () => {
  assert.deepEqual(tamanoCaptura(4000, 3000, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(tamanoCaptura(1080, 1920, 1600), { w: 900, h: 1600 });
  assert.deepEqual(tamanoCaptura(640, 480, 1600), { w: 640, h: 480 });
  assert.deepEqual(tamanoCaptura(0, 0, 1600), { w: 1, h: 1 });
});
