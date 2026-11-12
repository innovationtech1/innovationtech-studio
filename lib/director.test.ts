import test from "node:test";
import assert from "node:assert/strict";
import {
  aplicarAcciones,
  clipsPara,
  TIPOS_DE_ACCION,
  costoDe,
  instruccionesDirector,
  resumenProyecto,
  textoCosto,
  validarAcciones,
  type Accion,
  type Ajustes,
  type Catalogo,
  type Estado,
} from "./director";
import { nuevoClip, type Clip } from "./linea-tiempo";

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
    conIa: false,
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

// ---------- Aplicar acciones ----------

const ajustes = (extra: Partial<Ajustes> = {}): Ajustes => ({
  formato: "9:16",
  tema: "",
  negocio: "Tortas Tortuga",
  cta: "",
  guion: "",
  vozId: "es-selena",
  hayVoz: false,
  subtitulos: true,
  musica: true,
  estilo: "pop",
  volumen: 0.6,
  ...extra,
});
const foto = (extra: Partial<Clip> = {}): Clip => nuevoClip({ image: "data:x", ...extra });
const estado = (clips: Clip[], extra: Partial<Ajustes> = {}): Estado => ({ clips, ajustes: ajustes(extra) });
const todo = { voz: true, ia: true };
const aplicar = (e: Estado, acciones: Accion[], permisos = todo) => aplicarAcciones(e, acciones, cat, permisos);

test("aplicar: borrar, mover, duplicar y agregar, con una línea por acción", () => {
  const [a, b, c] = [foto(), foto(), foto()];
  const e = estado([a, b, c]);
  let r = aplicar(e, [{ tipo: "borrar_clip", clip: 2 }]);
  assert.deepEqual(r.estado.clips.map((x) => x.id), [a.id, c.id]);
  assert.deepEqual(r.hecho, ["Borré el clip 2"]);
  r = aplicar(e, [{ tipo: "mover_clip", clip: 1, a: 3 }]);
  assert.deepEqual(r.estado.clips.map((x) => x.id), [b.id, c.id, a.id]);
  assert.deepEqual(r.hecho, ["Moví el clip 1 al lugar 3"]);
  r = aplicar(e, [{ tipo: "duplicar_clip", clip: 1 }]);
  assert.equal(r.estado.clips.length, 4);
  assert.deepEqual(r.hecho, ["Dupliqué el clip 1"]);
  r = aplicar(e, [{ tipo: "agregar_clip", cantidad: 2 }]);
  assert.equal(r.estado.clips.length, 5);
  assert.deepEqual(r.hecho, ["Agregué 2 clips"]);
  assert.deepEqual(e.clips.map((x) => x.id), [a.id, b.id, c.id]); // no modifica lo que recibe
});

test("aplicar: un clip que no existe se avisa y no cambia nada", () => {
  const e = estado([foto(), foto(), foto(), foto()]);
  const r = aplicar(e, [{ tipo: "texto", clip: 9, texto: "Hola" }]);
  assert.deepEqual(r.avisos, ["No existe el clip 9"]);
  assert.deepEqual(r.hecho, []);
  assert.deepEqual(r.estado.clips, e.clips);
});

test("aplicar: las acciones van en orden (agregar y luego usar el clip nuevo)", () => {
  const r = aplicar(estado([foto(), foto(), foto(), foto()]), [
    { tipo: "agregar_clip", cantidad: 2 },
    { tipo: "texto", clip: 6, texto: "Hola" },
  ]);
  assert.equal(r.estado.clips[5].caption, "Hola");
  assert.deepEqual(r.avisos, []);
});

test("aplicar: duración y estilo de texto para un clip o para todos", () => {
  const toma = foto({ tipo: "toma" });
  let r = aplicar(estado([foto(), toma, foto()]), [{ tipo: "duracion", clip: "todos", segundos: 6 }]);
  assert.deepEqual(r.estado.clips.map((c) => c.segundos), [6, toma.segundos, 6]);
  r = aplicar(estado([foto(), foto()]), [{ tipo: "duracion", clip: 2, segundos: 9 }]);
  assert.deepEqual(r.estado.clips.map((c) => c.segundos), [8, 9]);
  r = aplicar(estado([foto(), foto()]), [{ tipo: "estilo_texto", clip: "todos", posicion: "arriba", tamano: "grande" }]);
  assert.ok(r.estado.clips.every((c) => c.textoPos === "arriba" && c.textoTam === "grande"));
  r = aplicar(estado([foto(), foto()]), [{ tipo: "estilo_texto", clip: 2, tamano: "chico" }]);
  assert.deepEqual(r.estado.clips.map((c) => c.textoTam), [undefined, "chico"]);
});

test("aplicar: duracion_total reparte las fotos y no toca las tomas", () => {
  let r = aplicar(estado([foto(), foto(), foto()]), [{ tipo: "duracion_total", segundos: 30 }]);
  assert.deepEqual(r.estado.clips.map((c) => c.segundos), [9, 9, 9]);
  const toma = foto({ tipo: "toma" });
  r = aplicar(estado([foto(), toma, foto()]), [{ tipo: "duracion_total", segundos: 30 }]);
  assert.deepEqual(r.estado.clips.map((c) => c.segundos), [11, toma.segundos, 11]);
  r = aplicar(estado([foto()]), [{ tipo: "duracion_total", segundos: 120 }]);
  assert.equal(r.estado.clips[0].segundos, 15);
  r = aplicar(estado([nuevoClip()]), [{ tipo: "duracion_total", segundos: 30 }]);
  assert.equal(r.avisos.length, 1);
});

test("aplicar: imagen deja el pedido pendiente y no toca la foto", () => {
  const a = foto();
  const r = aplicar(estado([a]), [{ tipo: "imagen", clip: 1, descripcion: "a torta" }]);
  assert.equal(r.estado.clips[0].image, "data:x");
  assert.equal(r.estado.clips[0].prompt, "a torta");
  assert.deepEqual(r.pendientes, [{ tipo: "imagen", clipId: a.id, descripcion: "a torta" }]);
});

test("aplicar: animar marca la foto, con sus límites", () => {
  let r = aplicar(estado([foto()]), [{ tipo: "animar", clip: 1, activar: true, movimiento: "zoom" }]);
  assert.equal(r.estado.clips[0].tipo, "toma");
  assert.equal(r.estado.clips[0].movimiento, "zoom");
  assert.deepEqual(r.pendientes, []); // nunca lanza la toma
  r = aplicar(estado([foto({ tipo: "toma" })]), [{ tipo: "animar", clip: 1, activar: false }]);
  assert.equal(r.estado.clips[0].tipo, "foto");
  r = aplicar(estado([foto()]), [{ tipo: "animar", clip: 1, activar: true }], { voz: true, ia: false });
  assert.equal(r.estado.clips[0].tipo, "foto");
  assert.deepEqual(r.avisos, ["Inicia sesión para animar fotos con IA"]);
  r = aplicar(estado([nuevoClip()]), [{ tipo: "animar", clip: 1, activar: true }]);
  assert.equal(r.estado.clips[0].tipo, "foto");
  assert.equal(r.avisos.length, 1);
  const cuatro = Array.from({ length: 4 }, () => foto({ tipo: "toma" }));
  r = aplicar(estado([...cuatro, foto()]), [{ tipo: "animar", clip: 5, activar: true }]);
  assert.equal(r.estado.clips[4].tipo, "foto");
  assert.deepEqual(r.avisos, ["Máximo 4 fotos con IA por video"]);
});

test("aplicar: formato, cierre, subtítulos y música cambian los ajustes", () => {
  const r = aplicar(estado([foto()]), [
    { tipo: "formato", valor: "1:1" },
    { tipo: "cierre", cta: "Te esperamos" },
    { tipo: "subtitulos", activar: false },
    { tipo: "musica", estilo: "lofi", volumen: 40 },
  ]);
  assert.equal(r.estado.ajustes.formato, "1:1");
  assert.equal(r.estado.ajustes.cta, "Te esperamos");
  assert.equal(r.estado.ajustes.negocio, "Tortas Tortuga");
  assert.equal(r.estado.ajustes.subtitulos, false);
  assert.equal(r.estado.ajustes.estilo, "lofi");
  assert.equal(r.estado.ajustes.volumen, 0.4);
  assert.equal(r.estado.ajustes.musica, true);
});

test("aplicar: subir y bajar la música, y apagarla", () => {
  let r = aplicar(estado([foto()], { volumen: 0.6 }), [{ tipo: "musica", volumen: "subir" }]);
  assert.equal(r.estado.ajustes.volumen, 0.75);
  r = aplicar(estado([foto()], { volumen: 0.1 }), [{ tipo: "musica", volumen: "bajar" }]);
  assert.equal(r.estado.ajustes.volumen, 0);
  r = aplicar(estado([foto()], { volumen: 0.95 }), [{ tipo: "musica", volumen: "subir" }]);
  assert.equal(r.estado.ajustes.volumen, 1);
  r = aplicar(estado([foto()]), [{ tipo: "musica", activar: false }]);
  assert.equal(r.estado.ajustes.musica, false);
  r = aplicar(estado([foto()], { musica: false }), [{ tipo: "musica", estilo: "cumbia" }]);
  assert.equal(r.estado.ajustes.musica, true); // elegir un estilo la enciende
});

test("aplicar: cambiar el guion con voz ya generada pide generarla de nuevo", () => {
  const r = aplicar(estado([foto()], { guion: "viejo", hayVoz: true }), [{ tipo: "guion", texto: "nuevo" }]);
  assert.equal(r.estado.ajustes.guion, "nuevo");
  assert.equal(r.estado.ajustes.hayVoz, false);
  assert.deepEqual(r.avisos, ["Cambió el guion: genera la voz de nuevo"]);
  assert.deepEqual(r.pendientes, [{ tipo: "quitar_voz" }]);
});

test("aplicar: voz por género, generar y quitar", () => {
  let r = aplicar(estado([foto()], { guion: "hola" }), [{ tipo: "voz", genero: "hombre", generar: true }]);
  assert.equal(r.estado.ajustes.vozId, "es-javier");
  assert.deepEqual(r.pendientes, [{ tipo: "voz", ajustarFotos: false }]);
  r = aplicar(estado([foto()]), [{ tipo: "voz", generar: true }]);
  assert.deepEqual(r.avisos, ["Escribe primero el guion"]);
  assert.deepEqual(r.pendientes, []);
  r = aplicar(estado([foto()], { guion: "hola" }), [{ tipo: "voz", generar: true }], { voz: false, ia: true });
  assert.deepEqual(r.avisos, ["Tu plan no incluye voz"]);
  assert.deepEqual(r.pendientes, []);
  r = aplicar(estado([foto()], { guion: "hola", hayVoz: true }), [{ tipo: "voz", quitar: true }]);
  assert.deepEqual(r.pendientes, [{ tipo: "quitar_voz" }]);
  assert.equal(r.estado.ajustes.hayVoz, false);
  // Con voz ya generada, elegir otra voz la vuelve a generar (como el selector de voces)
  r = aplicar(estado([foto()], { guion: "hola", hayVoz: true }), [{ tipo: "voz", voz: "es-javier" }]);
  assert.deepEqual(r.pendientes, [{ tipo: "voz", ajustarFotos: false }]);
  // Sin voz generada, solo queda elegida
  r = aplicar(estado([foto()], { guion: "hola" }), [{ tipo: "voz", voz: "es-javier" }]);
  assert.deepEqual(r.pendientes, []);
});

const armar = (extra: Partial<Extract<Accion, { tipo: "armar" }>> = {}): Accion => ({
  tipo: "armar",
  conIa: false,
  tema: "promo",
  clips: 4,
  segundosPorFoto: 8,
  textos: ["t1", "t2", "t3", "t4"],
  imagenes: ["i1", "i2", "i3", "i4"],
  cta: "Ven hoy",
  guion: "El guion",
  musica: "cumbia",
  ...extra,
});

test("armar: sobre clips vacíos pone textos, duración, cierre, guion y música, y deja imágenes y voz pendientes", () => {
  const vacios = [nuevoClip(), nuevoClip(), nuevoClip(), nuevoClip()];
  const r = aplicar(estado(vacios), [armar()]);
  assert.deepEqual(r.estado.clips.map((c) => [c.caption, c.prompt, c.segundos]), [
    ["t1", "i1", 8],
    ["t2", "i2", 8],
    ["t3", "i3", 8],
    ["t4", "i4", 8],
  ]);
  assert.equal(r.estado.ajustes.cta, "Ven hoy");
  assert.equal(r.estado.ajustes.guion, "El guion");
  assert.equal(r.estado.ajustes.estilo, "cumbia");
  assert.deepEqual(
    r.pendientes,
    [...r.estado.clips.map((c, i) => ({ tipo: "imagen", clipId: c.id, descripcion: `i${i + 1}` })), { tipo: "voz", ajustarFotos: true }],
  );
  assert.deepEqual(costoDe(r.pendientes), { imagenes: 4, voces: 1, tomas: 0 });
});

test("armar: conserva la foto que ya había y quita los clips vacíos que sobran", () => {
  const a = foto({ caption: "viejo" });
  const r = aplicar(estado([a, nuevoClip(), nuevoClip(), nuevoClip(), nuevoClip()]), [armar({ clips: 3, textos: ["t1", "t2", "t3"], imagenes: ["i1", "i2", "i3"] })]);
  assert.equal(r.estado.clips.length, 3);
  assert.equal(r.estado.clips[0].id, a.id);
  assert.equal(r.estado.clips[0].image, "data:x");
  assert.equal(r.estado.clips[0].caption, "t1");
  assert.equal(costoDe(r.pendientes).imagenes, 2);
});

test("armar: nunca borra un clip con foto aunque pida menos clips", () => {
  const tres = [foto({ caption: "a" }), foto({ caption: "b" }), foto({ caption: "c" })];
  const r = aplicar(estado(tres), [armar({ clips: 2, textos: ["t1", "t2"], imagenes: ["i1", "i2"] })]);
  assert.deepEqual(r.estado.clips.map((c) => c.caption), ["t1", "t2", "c"]);
  assert.ok(r.estado.clips.every((c) => c.image === "data:x"));
  assert.equal(costoDe(r.pendientes).imagenes, 0);
});

test("armar: agrega los clips que falten", () => {
  const r = aplicar(estado([nuevoClip()]), [armar()]);
  assert.equal(r.estado.clips.length, 4);
});

test("armar: sin voz en el plan se arma todo lo demás y se avisa", () => {
  const r = aplicar(estado([nuevoClip()]), [armar()], { voz: false, ia: true });
  assert.equal(costoDe(r.pendientes).voces, 0);
  assert.deepEqual(r.avisos, ["Tu plan no incluye voz"]);
  assert.equal(r.estado.ajustes.guion, "El guion");
});

test("armar y luego duracion_total: cuenta las fotos que están por crearse", () => {
  const r = aplicar(estado([nuevoClip()]), [armar(), { tipo: "duracion_total", segundos: 43 }]);
  assert.deepEqual(r.estado.clips.map((c) => c.segundos), [10, 10, 10, 10]);
  assert.deepEqual(r.avisos, []);
});

test("vista previa y crear video quedan para el final; si vienen los dos, solo crear", () => {
  let r = aplicar(estado([foto()]), [{ tipo: "vista_previa" }]);
  assert.deepEqual(r.pendientes, [{ tipo: "vista_previa" }]);
  r = aplicar(estado([foto()]), [{ tipo: "vista_previa" }, { tipo: "crear_video" }, { tipo: "imagen", clip: 1, descripcion: "x" }]);
  assert.deepEqual(r.pendientes.map((p) => p.tipo), ["imagen", "crear_video"]);
});

test("costo: texto de la confirmación", () => {
  assert.equal(textoCosto({ imagenes: 4, voces: 1, tomas: 0 }), "Esta orden usa 4 imágenes y 1 voz.");
  assert.equal(textoCosto({ imagenes: 1, voces: 0, tomas: 0 }), "Esta orden usa 1 imagen.");
  assert.equal(textoCosto({ imagenes: 0, voces: 1, tomas: 0 }), "Esta orden usa 1 voz.");
  assert.equal(textoCosto({ imagenes: 0, voces: 0, tomas: 0 }), null);
});

test("resumenProyecto: textos y números, nunca las fotos", () => {
  const r = resumenProyecto(estado([foto({ caption: "Hola", imageId: "reel-1", segundos: 4 }), nuevoClip({ tipo: "toma" })], { guion: "g", cta: "c" }));
  const json = JSON.stringify(r);
  assert.ok(!json.includes("data:x") && !json.includes("reel-1"));
  assert.deepEqual(r.clips, [
    { n: 1, tipo: "foto", segundos: 4, foto: true, texto: "Hola" },
    { n: 2, tipo: "con_ia", segundos: 5, foto: false, texto: "" },
  ]);
  assert.equal(r.guion, "g");
  assert.equal(r.formato, "9:16");
});

// ---------- Instrucciones para la IA ----------

const instr = (extra: Partial<Parameters<typeof instruccionesDirector>[0]> = {}) =>
  instruccionesDirector({
    resumen: { formato: "9:16", clips: [{ n: 1, tipo: "foto", segundos: 3, foto: true, texto: "Hola" }] },
    estilos: [{ id: "pop", nombre: "Alegre pop" }, { id: "lofi", nombre: "Lo-fi relajado" }],
    voces: [{ id: "es-selena", nombre: "Selena", genero: "mujer" }],
    ...extra,
  });

test("instrucciones: nombran todo el catálogo y las reglas de costo", () => {
  const { system } = instr();
  assert.equal(TIPOS_DE_ACCION.length, 20);
  for (const t of TIPOS_DE_ACCION) assert.ok(system.includes(`"${t}"`), `falta ${t}`);
  assert.match(system, /Responde SOLO con un objeto JSON/);
  assert.ok(system.includes("pop") && system.includes("lofi") && system.includes("es-selena"));
  assert.match(system, /entre 7 y 10 segundos/);
  assert.match(system, /dividida entre 8/);
  assert.match(system, /2\.3 palabras por segundo/);
  assert.match(system, /nunca inventes acciones/i);
  assert.match(system, /"acciones": \[\]/); // ejemplo de «no se puede»
});

test("instrucciones: el mensaje lleva la orden y el estado del video", () => {
  const u = instr().user("quita el clip 2");
  assert.ok(u.includes("quita el clip 2"));
  assert.ok(u.includes('"texto":"Hola"'));
});

test("instrucciones: marca e inglés", () => {
  assert.ok(instr({ marca: "Tortas Tortuga, comida mexicana" }).system.includes("Tortas Tortuga, comida mexicana"));
  assert.match(instr({ ingles: true }).system, /in English/);
  assert.doesNotMatch(instr().system, /in English/);
});

test("armar: el tema queda escrito en el paso 1 del reel", () => {
  const r = aplicar(estado([nuevoClip()], { tema: "" }), [armar({ tema: "promo 2x1 de los martes" })]);
  assert.equal(r.estado.ajustes.tema, "promo 2x1 de los martes");
  assert.equal(resumenProyecto(r.estado).tema, "promo 2x1 de los martes");
});

// ---------- Tomas con IA desde una orden (solo si la persona lo pide) ----------

test("validar: generar_ia y armar con_ia", () => {
  assert.deepEqual(una({ tipo: "generar_ia" }), { tipo: "generar_ia" });
  const a = una({ tipo: "armar", tema: "t", con_ia: true });
  assert.ok(a && a.tipo === "armar" && a.conIa === true);
  const b = una({ tipo: "armar", tema: "t" });
  assert.ok(b && b.tipo === "armar" && b.conIa === false);
});

test("armar con IA: anima todas las fotos hasta 4 y deja pendiente generar las tomas", () => {
  const r = aplicar(estado([nuevoClip()]), [armar({ clips: 6, textos: ["1", "2", "3", "4", "5", "6"], imagenes: ["a", "b", "c", "d", "e", "f"], conIa: true }), { tipo: "generar_ia" }]);
  assert.deepEqual(r.estado.clips.map((c) => c.tipo), ["toma", "toma", "toma", "toma", "foto", "foto"]);
  assert.deepEqual(r.pendientes[r.pendientes.length - 1], { tipo: "generar_ia", tomas: 4 });
  assert.deepEqual(costoDe(r.pendientes), { imagenes: 6, voces: 1, tomas: 4 });
  assert.equal(textoCosto(costoDe(r.pendientes)), "Esta orden usa 6 imágenes, 1 voz y hasta 4 tomas con IA.");
});

test("armar con IA arma solo: aunque la IA olvide generar_ia, las tomas se generan", () => {
  const r = aplicar(estado([nuevoClip()]), [armar({ conIa: true })]);
  assert.deepEqual(r.pendientes[r.pendientes.length - 1], { tipo: "generar_ia", tomas: 4 });
});

test("armar sin IA no anima ni gasta tomas", () => {
  const r = aplicar(estado([nuevoClip()]), [armar()]);
  assert.ok(r.estado.clips.every((c) => c.tipo === "foto"));
  assert.equal(costoDe(r.pendientes).tomas, 0);
});

test("animar un clip y generar_ia: una toma pendiente", () => {
  const r = aplicar(estado([foto(), foto()]), [{ tipo: "animar", clip: 1, activar: true }, { tipo: "generar_ia" }]);
  assert.deepEqual(r.pendientes, [{ tipo: "generar_ia", tomas: 1 }]);
  assert.equal(textoCosto(costoDe(r.pendientes)), "Esta orden usa hasta 1 toma con IA.");
});

test("generar_ia: sin fotos marcadas o sin sesión se avisa y no queda pendiente", () => {
  let r = aplicar(estado([foto()]), [{ tipo: "generar_ia" }]);
  assert.deepEqual(r.pendientes, []);
  assert.deepEqual(r.avisos, ["Marca primero qué fotos animar con IA"]);
  r = aplicar(estado([foto({ tipo: "toma" })]), [{ tipo: "generar_ia" }], { voz: true, ia: false });
  assert.deepEqual(r.pendientes, []);
  assert.deepEqual(r.avisos, ["Inicia sesión para animar fotos con IA"]);
  r = aplicar(estado([nuevoClip()]), [armar({ conIa: true })], { voz: true, ia: false });
  assert.ok(r.estado.clips.every((c) => c.tipo === "foto"));
  assert.equal(costoDe(r.pendientes).tomas, 0);
});

test("generar_ia manda sobre crear_video y vista previa (el video se graba al terminar las tomas)", () => {
  const r = aplicar(estado([foto({ tipo: "toma" })]), [{ tipo: "crear_video" }, { tipo: "generar_ia" }, { tipo: "vista_previa" }]);
  assert.deepEqual(r.pendientes, [{ tipo: "generar_ia", tomas: 1 }]);
});

test("instrucciones: las tomas con IA solo si la persona lo pide", () => {
  const { system } = instr();
  assert.match(system, /"generar_ia"/);
  assert.match(system, /"con_ia"/);
  assert.match(system, /solo si la persona lo pide/i);
});
