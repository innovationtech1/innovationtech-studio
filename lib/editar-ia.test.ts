import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EJEMPLOS_EDICION,
  LADO_EDITAR,
  clasificarEdicion,
  formatoDeExtension,
  instruccionEdicion,
  limpiarPedido,
  mensajeNovaEdicion,
  planDeEdicion,
  tamanoSalida,
  validarEdicion,
} from "./editar-ia";

const FOTO = "data:image/jpeg;base64," + "A".repeat(200);

test("LADO_EDITAR: la foto viaja por debajo de 512, el límite del modelo", () => {
  assert.ok(LADO_EDITAR < 512);
});

test("limpiarPedido: quita espacios de sobra, saltos de línea y corta lo muy largo", () => {
  assert.equal(limpiarPedido("  quita   la\n servilleta  "), "quita la servilleta");
  assert.equal(limpiarPedido(null), "");
  assert.equal(limpiarPedido(42), "");
  assert.equal(limpiarPedido("x".repeat(900)).length, 300);
});

test("clasificarEdicion: borrar", () => {
  for (const t of ["Quita la servilleta de la mesa", "borra el letrero", "elimina a la persona del fondo", "remove the cup"])
    assert.equal(clasificarEdicion(t), "borrar", t);
});

test("clasificarEdicion: extender", () => {
  for (const t of ["Hazla vertical para historia", "extiende la imagen a los lados", "amplía el fondo", "ponla en formato cuadrado", "make it vertical", "necesito más espacio arriba"])
    assert.equal(clasificarEdicion(t), "extender", t);
});

test("clasificarEdicion: mejorar", () => {
  for (const t of ["Mejora la calidad", "hazla más nítida", "se ve pixelada, arréglala", "improve the quality", "upscale"])
    assert.equal(clasificarEdicion(t), "mejorar", t);
});

test("clasificarEdicion: todo lo demás es cambiar", () => {
  for (const t of ["Pon el fondo de una playa", "cambia el mantel a rojo", "que sea de noche", ""])
    assert.equal(clasificarEdicion(t), "cambiar", t);
});

test("formatoDeExtension: lee el formato pedido", () => {
  assert.equal(formatoDeExtension("hazla vertical para historia", 1200, 800), "9:16");
  assert.equal(formatoDeExtension("para un reel", 1200, 800), "9:16");
  assert.equal(formatoDeExtension("ponla cuadrada", 1200, 800), "1:1");
  assert.equal(formatoDeExtension("hazla horizontal", 800, 1200), "16:9");
  assert.equal(formatoDeExtension("para youtube", 800, 1200), "16:9");
  assert.equal(formatoDeExtension("para el feed de instagram", 1200, 800), "4:5");
});

test("formatoDeExtension: sin formato dicho, vertical; y si ya es muy vertical, cuadrada", () => {
  assert.equal(formatoDeExtension("extiende el fondo", 1200, 800), "9:16");
  assert.equal(formatoDeExtension("extiende el fondo", 1000, 1000), "9:16");
  assert.equal(formatoDeExtension("extiende el fondo", 720, 1280), "1:1");
});

test("tamanoSalida: conserva la proporción, en múltiplos de 16 y dentro de lo que acepta el modelo", () => {
  const [w, h] = tamanoSalida(4000, 3000);
  assert.equal(w % 16, 0);
  assert.equal(h % 16, 0);
  assert.equal(Math.max(w, h), 1344);
  assert.ok(Math.abs(w / h - 4 / 3) < 0.03);
  assert.deepEqual(tamanoSalida(1000, 1000), [1008, 1008]);
});

test("tamanoSalida: una foto chica sube a un tamaño usable y una muy alargada no baja de 256", () => {
  const [w, h] = tamanoSalida(300, 200);
  assert.equal(Math.max(w, h), 768);
  const [a, b] = tamanoSalida(3000, 300);
  assert.equal(a, 1344);
  assert.equal(b, 256);
});

test("tamanoSalida: medidas que no sirven dan un cuadrado", () => {
  assert.deepEqual(tamanoSalida(0, 0), [1024, 1024]);
  assert.deepEqual(tamanoSalida(NaN, 100), [1024, 1024]);
});

test("planDeEdicion: cambiar y borrar conservan la proporción de la foto", () => {
  const p = planDeEdicion("quita la servilleta", 1600, 1200);
  assert.equal(p.tipo, "borrar");
  assert.equal(p.formato, undefined);
  assert.deepEqual([p.ancho, p.alto], tamanoSalida(1600, 1200));
});

test("planDeEdicion: extender usa el tamaño del formato pedido", () => {
  const p = planDeEdicion("hazla vertical para historia", 1600, 1200);
  assert.equal(p.tipo, "extender");
  assert.equal(p.formato, "9:16");
  assert.deepEqual([p.ancho, p.alto], [768, 1344]);
});

test("instruccionEdicion: lleva el pedido tal cual y pide no tocar lo demás", () => {
  const t = instruccionEdicion("cambiar", "pon el fondo de una playa");
  assert.match(t, /pon el fondo de una playa/);
  assert.match(t, /keep/i);
  assert.ok(t.length <= 2048);
});

test("instruccionEdicion: al extender pide continuar el fondo sin cambiar lo principal ni agregar texto", () => {
  const t = instruccionEdicion("extender", "hazla vertical");
  assert.match(t, /extend/i);
  assert.match(t, /text/i);
});

test("instruccionEdicion: al borrar pide rellenar con el fondo", () => {
  assert.match(instruccionEdicion("borrar", "quita la servilleta"), /remove/i);
});

test("validarEdicion: acepta una foto y un pedido", () => {
  const v = validarEdicion({ foto: FOTO, pedido: " quita  el vaso ", ancho: 1600, alto: 1200 });
  assert.ok(v.ok);
  if (v.ok) {
    assert.equal(v.pedido, "quita el vaso");
    assert.equal(v.plan.tipo, "borrar");
    assert.equal(v.foto, FOTO);
  }
});

test("validarEdicion: sin foto, sin pedido o con algo que no es imagen, explica qué falta", () => {
  for (const cuerpo of [null, {}, { foto: FOTO }, { foto: FOTO, pedido: "   " }, { foto: "https://x.com/a.jpg", pedido: "quita" }, { foto: "data:text/html;base64,AAAA", pedido: "quita" }]) {
    const v = validarEdicion(cuerpo);
    assert.equal(v.ok, false);
    if (!v.ok) assert.ok(v.error.length > 5);
  }
});

test("validarEdicion: una foto demasiado pesada se rechaza antes de gastar", () => {
  const v = validarEdicion({ foto: "data:image/jpeg;base64," + "A".repeat(1_500_000), pedido: "quita el vaso" });
  assert.equal(v.ok, false);
});

test("validarEdicion: «mejorar la calidad» todavía no se hace aquí y lo dice sin gastar", () => {
  const v = validarEdicion({ foto: FOTO, pedido: "mejora la calidad", ancho: 800, alto: 800 });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.codigo, "PRONTO");
});

test("validarEdicion: sin medidas usa un cuadrado", () => {
  const v = validarEdicion({ foto: FOTO, pedido: "cambia el color" });
  assert.ok(v.ok);
  if (v.ok) assert.deepEqual([v.plan.ancho, v.plan.alto], [1024, 1024]);
});

test("EJEMPLOS_EDICION: pocos, y ninguno es de mejorar calidad", () => {
  assert.ok(EJEMPLOS_EDICION.length >= 3 && EJEMPLOS_EDICION.length <= 5);
  for (const e of EJEMPLOS_EDICION) assert.notEqual(clasificarEdicion(e), "mejorar");
});

test("mensajeNovaEdicion: guía cada momento", () => {
  assert.match(mensajeNovaEdicion({ paso: "pedir" }), /dime/i);
  assert.match(mensajeNovaEdicion({ paso: "trabajando", tipo: "borrar" }), /borr|quit/i);
  assert.match(mensajeNovaEdicion({ paso: "trabajando", tipo: "extender" }), /extend/i);
  assert.match(mensajeNovaEdicion({ paso: "trabajando", tipo: "cambiar", lento: true }), /tard/i);
  assert.match(mensajeNovaEdicion({ paso: "listo" }), /antes/i);
  assert.match(mensajeNovaEdicion({ paso: "error", error: "Se acabaron tus imágenes." }), /Se acabaron tus imágenes/);
  assert.match(mensajeNovaEdicion({ paso: "pronto" }), /pronto/i);
});
