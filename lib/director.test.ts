import test from "node:test";
import assert from "node:assert/strict";
import { clipsPara, validarAcciones, type Accion, type Catalogo } from "./director";

const cat: Catalogo = {
  estilos: ["pop", "lofi", "cumbia"],
  voces: [
    { id: "es-selena", genero: "mujer" },
    { id: "es-javier", genero: "hombre" },
  ],
};
const una = (a: unknown): Accion | undefined => validarAcciones({ acciones: [a] }, cat).acciones[0];
const descartada = (a: unknown) => assert.deepEqual(validarAcciones({ acciones: [a] }, cat), { acciones: [], descartadas: 1 });

test("validar: una acción válida de cada tipo", () => {
  assert.deepEqual(una({ tipo: "agregar_clip", cantidad: 2 }), { tipo: "agregar_clip", cantidad: 2 });
  assert.deepEqual(una({ tipo: "agregar_clip" }), { tipo: "agregar_clip", cantidad: 1 });
  assert.deepEqual(una({ tipo: "borrar_clip", clip: 2 }), { tipo: "borrar_clip", clip: 2 });
  assert.deepEqual(una({ tipo: "mover_clip", clip: 1, a: 3 }), { tipo: "mover_clip", clip: 1, a: 3 });
  assert.deepEqual(una({ tipo: "duplicar_clip", clip: 1 }), { tipo: "duplicar_clip", clip: 1 });
  assert.deepEqual(una({ tipo: "duracion", clip: "todos", segundos: 6 }), { tipo: "duracion", clip: "todos", segundos: 6 });
  assert.deepEqual(una({ tipo: "duracion_total", segundos: 45 }), { tipo: "duracion_total", segundos: 45 });
  assert.deepEqual(una({ tipo: "texto", clip: 3, texto: " Solo hoy " }), { tipo: "texto", clip: 3, texto: "Solo hoy" });
  assert.deepEqual(una({ tipo: "estilo_texto", clip: "todos", posicion: "arriba", tamano: "grande" }), {
    tipo: "estilo_texto",
    clip: "todos",
    posicion: "arriba",
    tamano: "grande",
  });
  assert.deepEqual(una({ tipo: "imagen", clip: 2, descripcion: "a torta" }), { tipo: "imagen", clip: 2, descripcion: "a torta" });
  assert.deepEqual(una({ tipo: "animar", clip: 1, activar: true, movimiento: "zoom lento" }), {
    tipo: "animar",
    clip: 1,
    activar: true,
    movimiento: "zoom lento",
  });
  assert.deepEqual(una({ tipo: "formato", valor: "1:1" }), { tipo: "formato", valor: "1:1" });
  assert.deepEqual(una({ tipo: "cierre", cta: "Te esperamos" }), { tipo: "cierre", cta: "Te esperamos" });
  assert.deepEqual(una({ tipo: "guion", texto: "Hola a todos" }), { tipo: "guion", texto: "Hola a todos" });
  assert.deepEqual(una({ tipo: "voz", genero: "hombre", generar: true }), { tipo: "voz", genero: "hombre", generar: true });
  assert.deepEqual(una({ tipo: "voz", voz: "es-selena" }), { tipo: "voz", voz: "es-selena" });
  assert.deepEqual(una({ tipo: "voz", quitar: true }), { tipo: "voz", quitar: true });
  assert.deepEqual(una({ tipo: "subtitulos", activar: false }), { tipo: "subtitulos", activar: false });
  assert.deepEqual(una({ tipo: "musica", estilo: "lofi", volumen: 40 }), { tipo: "musica", estilo: "lofi", volumen: 40 });
  assert.deepEqual(una({ tipo: "vista_previa" }), { tipo: "vista_previa" });
  assert.deepEqual(una({ tipo: "crear_video" }), { tipo: "crear_video" });
});

test("validar: armar normaliza clips, segundos por foto, textos e imágenes", () => {
  const a = una({ tipo: "armar", tema: "promo 2x1", clips: 3, segundos_por_foto: 9, textos: ["a", "b", "c", "d"], imagenes: ["x"], cta: "Ven", guion: "g", musica: "pop" });
  assert.deepEqual(a, {
    tipo: "armar",
    tema: "promo 2x1",
    clips: 3,
    segundosPorFoto: 9,
    textos: ["a", "b", "c"],
    imagenes: ["x", "promo 2x1, advertising photography, high quality", "promo 2x1, advertising photography, high quality"],
    cta: "Ven",
    guion: "g",
    musica: "pop",
  });
  const b = una({ tipo: "armar", tema: "t" });
  assert.ok(b && b.tipo === "armar");
  assert.equal(b.clips, 4);
  assert.equal(b.segundosPorFoto, 8);
  assert.deepEqual(b.textos, ["", "", "", ""]);
  assert.equal(b.musica, undefined);
  const c = una({ tipo: "armar", tema: "t", clips: 30, segundos_por_foto: 3, musica: "polka" });
  assert.ok(c && c.tipo === "armar");
  assert.equal(c.clips, 12);
  assert.equal(c.segundosPorFoto, 7);
  assert.equal(c.musica, undefined); // estilo fuera del catálogo: se arma sin cambiar la música
  const d = una({ tipo: "armar", tema: "t", segundos_por_foto: 20 });
  assert.ok(d && d.tipo === "armar" && d.segundosPorFoto === 10);
});

test("validar: los números se acotan a su rango", () => {
  assert.deepEqual(una({ tipo: "duracion", clip: 1, segundos: 0.2 }), { tipo: "duracion", clip: 1, segundos: 1.5 });
  assert.deepEqual(una({ tipo: "duracion", clip: 1, segundos: 40 }), { tipo: "duracion", clip: 1, segundos: 15 });
  assert.deepEqual(una({ tipo: "duracion_total", segundos: 500 }), { tipo: "duracion_total", segundos: 120 });
  assert.deepEqual(una({ tipo: "duracion_total", segundos: 1 }), { tipo: "duracion_total", segundos: 5 });
  assert.deepEqual(una({ tipo: "agregar_clip", cantidad: 99 }), { tipo: "agregar_clip", cantidad: 10 });
  assert.deepEqual(una({ tipo: "musica", volumen: 150 }), { tipo: "musica", volumen: 100 });
  assert.deepEqual(una({ tipo: "musica", volumen: "subir" }), { tipo: "musica", volumen: "subir" });
  assert.deepEqual(una({ tipo: "musica", activar: false }), { tipo: "musica", activar: false });
});

test("validar: los textos largos se cortan", () => {
  const t = una({ tipo: "texto", clip: 1, texto: "x".repeat(300) });
  assert.ok(t && t.tipo === "texto" && t.texto.length === 120);
  const g = una({ tipo: "guion", texto: "y".repeat(3000) });
  assert.ok(g && g.tipo === "guion" && g.texto.length === 1500);
});

test("validar: acepta números escritos como texto y el clip «todos» en mayúsculas", () => {
  assert.deepEqual(una({ tipo: "borrar_clip", clip: "2" }), { tipo: "borrar_clip", clip: 2 });
  assert.deepEqual(una({ tipo: "duracion", clip: "Todos", segundos: "6" }), { tipo: "duracion", clip: "todos", segundos: 6 });
});

test("validar: descarta lo que no entiende", () => {
  descartada({ tipo: "explotar" });
  descartada({ tipo: "borrar_clip", clip: "dos" });
  descartada({ tipo: "borrar_clip", clip: 0 });
  descartada({ tipo: "borrar_clip", clip: 2.5 });
  descartada({ tipo: "borrar_clip", clip: "todos" });
  descartada({ tipo: "mover_clip", clip: 1 });
  descartada({ tipo: "formato", valor: "4:3" });
  descartada({ tipo: "musica", estilo: "polka" });
  descartada({ tipo: "musica" });
  descartada({ tipo: "voz", voz: "es-nadie" });
  descartada({ tipo: "voz" });
  descartada({ tipo: "estilo_texto", clip: 1 });
  descartada({ tipo: "estilo_texto", clip: 1, posicion: "lado" });
  descartada({ tipo: "texto", clip: 1 });
  descartada({ tipo: "imagen", clip: 1, descripcion: "  " });
  descartada({ tipo: "guion", texto: "" });
  descartada({ tipo: "cierre" });
  descartada({ tipo: "duracion", clip: 1 });
  descartada({ tipo: "armar" });
  descartada({ tipo: "subtitulos" });
  descartada("hola");
  descartada(null);
});

test("validar: máximo 20 acciones por orden", () => {
  const r = validarAcciones({ acciones: Array.from({ length: 25 }, () => ({ tipo: "agregar_clip" })) }, cat);
  assert.equal(r.acciones.length, 20);
  assert.equal(r.descartadas, 5);
});

test("validar: acepta la lista directa y aguanta basura", () => {
  assert.equal(validarAcciones([{ tipo: "crear_video" }], cat).acciones.length, 1);
  for (const malo of [null, "hola", {}, { acciones: "x" }, 7, undefined]) assert.deepEqual(validarAcciones(malo, cat), { acciones: [], descartadas: 0 });
});

test("clipsPara: duración pedida entre 8, de 2 a 12", () => {
  assert.equal(clipsPara(30), 4);
  assert.equal(clipsPara(60), 8);
  assert.equal(clipsPara(200), 12);
  assert.equal(clipsPara(5), 2);
  assert.equal(clipsPara(), 4);
});
