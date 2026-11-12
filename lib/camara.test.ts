import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeCamara, tamanoCaptura, MAX_GRABACION, formatoGrabacion, relojGrabacion } from "./camara";

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

test("relojGrabacion: lo grabado y el máximo", () => {
  assert.equal(MAX_GRABACION, 60);
  assert.equal(relojGrabacion(0), "0:00 / 1:00");
  assert.equal(relojGrabacion(7), "0:07 / 1:00");
  assert.equal(relojGrabacion(7.9), "0:07 / 1:00");
  assert.equal(relojGrabacion(60), "1:00 / 1:00");
  assert.equal(relojGrabacion(75), "1:00 / 1:00");
});

test("formatoGrabacion: MP4 si se puede, si no WebM, si nada null", () => {
  assert.match(formatoGrabacion(() => true)!, /^video\/mp4/);
  assert.match(formatoGrabacion((m) => m.startsWith("video/webm"))!, /^video\/webm/);
  assert.equal(formatoGrabacion((m) => m === "video/mp4"), "video/mp4");
  assert.equal(formatoGrabacion(() => false), null);
});

test("mensajeCamara: sin micrófono se graba sin sonido", () => {
  assert.equal(mensajeCamara("SinMicrofono"), "No hay permiso de micrófono: el video se grabará sin sonido.");
});
