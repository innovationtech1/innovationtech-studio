import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeCamara, tamanoCaptura, MAX_GRABACION, formatoGrabacion, relojGrabacion, camarasDe, esFrontal, pedidoDeCamara, siguienteCamara } from "./camara";

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

// ---------- Detectar y elegir la cámara ----------

const aparatos = [
  { kind: "audioinput", deviceId: "mic1", label: "Micrófono" },
  { kind: "videoinput", deviceId: "c1", label: "FaceTime HD Camera (Built-in)" },
  { kind: "videoinput", deviceId: "c2", label: "" },
  { kind: "videoinput", deviceId: "c1", label: "FaceTime HD Camera (Built-in)" }, // repetida
  { kind: "videoinput", deviceId: "", label: "" }, // sin permiso todavía: no sirve para elegir
];

test("camarasDe: solo las cámaras, sin repetir, con nombre aunque el navegador no lo dé", () => {
  assert.deepEqual(camarasDe(aparatos), [
    { id: "c1", nombre: "FaceTime HD Camera (Built-in)" },
    { id: "c2", nombre: "Cámara 2" },
  ]);
  assert.deepEqual(camarasDe([]), []);
});

test("pedidoDeCamara: una cámara elegida va por su id; si no, por delantera o trasera", () => {
  assert.deepEqual(pedidoDeCamara({ id: "c2", frente: false }), { deviceId: { exact: "c2" }, width: { ideal: 1920 }, height: { ideal: 1080 } });
  assert.deepEqual(pedidoDeCamara({ frente: true }), { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } });
  assert.deepEqual(pedidoDeCamara({ frente: false, ancho: 1280, alto: 720 }), { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } });
});

test("siguienteCamara: da la vuelta por la lista", () => {
  const lista = camarasDe(aparatos);
  assert.equal(siguienteCamara(lista, "c1"), "c2");
  assert.equal(siguienteCamara(lista, "c2"), "c1");
  assert.equal(siguienteCamara(lista, "otra"), "c1");
  assert.equal(siguienteCamara([], "c1"), null);
  assert.equal(siguienteCamara([lista[0]], "c1"), null); // con una sola no hay a cuál cambiar
});

test("esFrontal: por lo que dice el navegador o por el nombre", () => {
  assert.equal(esFrontal("user", ""), true);
  assert.equal(esFrontal("environment", "Front Camera"), false);
  assert.equal(esFrontal(undefined, "Cámara frontal"), true);
  assert.equal(esFrontal(undefined, "front camera"), true);
  assert.equal(esFrontal(undefined, "Logitech C920"), false);
});

test("mensajeCamara: sin ninguna cámara detectada", () => {
  assert.match(mensajeCamara("SinCamaras"), /No detectamos ninguna cámara/);
});
