import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AJUSTES_RAPIDOS,
  FORMATOS_IMAGEN,
  MAX_TEXTO_AJUSTE,
  confirmarImagen,
  instruccionesAjuste,
  instruccionesImagen,
  plataformaDe,
  validarAjuste,
  validarImagen,
} from "./director-secciones";

const REDES = ["Instagram", "Facebook", "TikTok", "LinkedIn", "X (Twitter)", "YouTube", "Anuncio pagado", "Email"];

// ---------- Textos: la orden elige la red social ----------

test("plataformaDe: reconoce la red social nombrada en la orden, sin importar mayúsculas ni acentos", () => {
  assert.equal(plataformaDe("Hazme un post para facebook del 2x1", REDES), "Facebook");
  assert.equal(plataformaDe("un TIKTOK de mis tortas", REDES), "TikTok");
  assert.equal(plataformaDe("para linkedin", REDES), "LinkedIn");
  assert.equal(plataformaDe("algo para youtube", REDES), "YouTube");
});

test("plataformaDe: entiende las formas comunes de decirlo (insta, twitter, correo, anuncio)", () => {
  assert.equal(plataformaDe("para el insta", REDES), "Instagram");
  assert.equal(plataformaDe("un tuit de la promo", REDES), "X (Twitter)");
  assert.equal(plataformaDe("ponlo en twitter", REDES), "X (Twitter)");
  assert.equal(plataformaDe("un correo para mis clientes", REDES), "Email");
  assert.equal(plataformaDe("un anuncio pagado de la promo", REDES), "Anuncio pagado");
});

test("plataformaDe: si no se nombra ninguna, no cambia nada (null)", () => {
  assert.equal(plataformaDe("Promoción de 2x1 en tortas los martes", REDES), null);
  assert.equal(plataformaDe("", REDES), null);
});

test("plataformaDe: no se confunde con palabras que solo contienen el nombre", () => {
  assert.equal(plataformaDe("un mensaje para el taxi", REDES), null); // «x» suelta dentro de otra palabra
  assert.equal(plataformaDe("examen de manejo", REDES), null);
});

test("plataformaDe: solo devuelve redes que existen en la lista de la app", () => {
  assert.equal(plataformaDe("para facebook", ["Instagram"]), null);
});

// ---------- Textos: corregir el texto ya creado ----------

test("instruccionesAjuste: manda el texto actual y pide conservar las etiquetas que la app necesita", () => {
  const i = instruccionesAjuste({ texto: "Hola\nPROMPT DE IMAGEN: a torta", ingles: false });
  assert.match(i.system, /PROMPT DE IMAGEN/);
  assert.match(i.system, /PROMPT DE VIDEO/);
  const u = i.user("hazlo más corto");
  assert.match(u, /hazlo más corto/);
  assert.match(u, /Hola/);
});

test("validarAjuste: devuelve el texto nuevo; vacío o igual al anterior no sirve", () => {
  assert.equal(validarAjuste("  Texto nuevo  ", "Texto viejo"), "Texto nuevo");
  assert.equal(validarAjuste("", "Texto viejo"), null);
  assert.equal(validarAjuste("Texto viejo", "Texto viejo"), null);
  assert.equal(validarAjuste(null, "Texto viejo"), null);
});

test("validarAjuste: quita las comillas o el bloque de código con que a veces envuelve la IA", () => {
  assert.equal(validarAjuste("```\nTexto nuevo\n```", "x"), "Texto nuevo");
});

test("los ajustes rápidos son pocos y cada uno trae su orden", () => {
  assert.ok(AJUSTES_RAPIDOS.length >= 4 && AJUSTES_RAPIDOS.length <= 6);
  for (const a of AJUSTES_RAPIDOS) assert.ok(a.nombre && a.orden);
  assert.ok(MAX_TEXTO_AJUSTE >= 4000);
});

// ---------- Imágenes: la orden llena descripción, formato y cantidad ----------

test("validarImagen: acepta una respuesta completa", () => {
  const r = validarImagen({ descripcion: "a mexican torta on a rustic table", formato: "9:16", cantidad: 2, marca: false, mensaje: "Listo" });
  assert.deepEqual(r, { descripcion: "a mexican torta on a rustic table", formato: "9:16", cantidad: 2, marca: false, mensaje: "Listo" });
});

test("validarImagen: sin descripción no hay nada que crear", () => {
  assert.equal(validarImagen({ formato: "1:1" }), null);
  assert.equal(validarImagen({ descripcion: "   " }), null);
  assert.equal(validarImagen(null), null);
  assert.equal(validarImagen("texto"), null);
});

test("validarImagen: lo que no se pidió o viene mal se deja sin tocar (undefined), no se inventa", () => {
  const r = validarImagen({ descripcion: "a torta", formato: "3:2", cantidad: 9, marca: "si" })!;
  assert.equal(r.formato, undefined);
  assert.equal(r.cantidad, undefined);
  assert.equal(r.marca, undefined);
  assert.equal(r.mensaje, "");
});

test("validarImagen: la cantidad va de 1 a 4 y debe ser entera", () => {
  assert.equal(validarImagen({ descripcion: "a", cantidad: 4 })!.cantidad, 4);
  assert.equal(validarImagen({ descripcion: "a", cantidad: 0 })!.cantidad, undefined);
  assert.equal(validarImagen({ descripcion: "a", cantidad: 2.5 })!.cantidad, undefined);
});

test("validarImagen: recorta descripciones y mensajes enormes", () => {
  const r = validarImagen({ descripcion: "a".repeat(5000), mensaje: "m".repeat(5000) })!;
  assert.ok(r.descripcion.length <= 1000);
  assert.ok(r.mensaje.length <= 300);
});

test("instruccionesImagen: pide la descripción en inglés, lista los formatos y cuenta lo que ya hay", () => {
  const i = instruccionesImagen({ actual: { descripcion: "a torta", formato: "1:1", cantidad: 1, marca: true, fotos: 2 }, ingles: false });
  assert.match(i.system, /ingl[eé]s|English/i);
  for (const f of FORMATOS_IMAGEN) assert.ok(i.system.includes(f));
  assert.match(i.system, /JSON/);
  assert.match(i.user("ahora vertical"), /ahora vertical/);
  assert.match(i.user("ahora vertical"), /a torta/);
});

test("confirmarImagen: pregunta antes de gastar, con la cantidad", () => {
  assert.equal(confirmarImagen(1), "¿Crear 1 imagen? Usa 1 imagen de tu plan.");
  assert.equal(confirmarImagen(3), "¿Crear 3 imágenes? Usa 3 imágenes de tu plan.");
});
