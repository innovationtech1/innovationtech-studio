import test from "node:test";
import assert from "node:assert/strict";
import {
  ajustarAVoz,
  aEscenas,
  borrar,
  cambiar,
  cierreDe,
  duplicar,
  duracionClip,
  duracionTotal,
  formatoTiempo,
  mover,
  normalizarClips,
  nuevoClip,
  validar,
  type Clip,
} from "./linea-tiempo";

const foto = (extra: Partial<Clip> = {}): Clip => nuevoClip({ image: "data:x", ...extra });
const fotos = (n: number, segundos = 3) => Array.from({ length: n }, () => foto({ segundos }));

test("nuevoClip: foto vacía de 8 s con id propio", () => {
  const a = nuevoClip();
  const b = nuevoClip();
  assert.equal(a.tipo, "foto");
  assert.equal(a.segundos, 8);
  assert.equal(a.image, "");
  assert.equal(a.caption, "");
  assert.equal(a.prompt, "");
  assert.ok(a.id);
  assert.notEqual(a.id, b.id);
});

test("normalizarClips: convierte las escenas viejas sin perder nada", () => {
  const r = normalizarClips(
    [
      { image: "x", caption: "a", prompt: "p", imageId: "reel-1", ia: true, movimiento: "zoom" },
      { image: "", caption: "", prompt: "" },
    ],
    4,
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].tipo, "toma");
  assert.equal(r[0].image, "x");
  assert.equal(r[0].imageId, "reel-1");
  assert.equal(r[0].caption, "a");
  assert.equal(r[0].prompt, "p");
  assert.equal(r[0].movimiento, "zoom");
  assert.equal(r[1].tipo, "foto");
  assert.equal(r[1].segundos, 4);
  assert.ok(r[0].id && r[1].id && r[0].id !== r[1].id);
  assert.equal("ia" in r[0], false);
});

test("normalizarClips: sin borrador válido deja 4 clips vacíos", () => {
  for (const malo of [null, "basura", [], undefined, 7]) {
    const r = normalizarClips(malo);
    assert.equal(r.length, 4);
    assert.ok(r.every((c) => c.tipo === "foto" && !c.image && c.segundos === 8));
  }
});

test("normalizarClips: los clips ya nuevos pasan igual y se acota la duración", () => {
  const a = foto({ segundos: 99, textoPos: "arriba", textoTam: "grande" });
  const [r] = normalizarClips([a]);
  assert.equal(r.id, a.id);
  assert.equal(r.segundos, 15);
  assert.equal(r.textoPos, "arriba");
  assert.equal(r.textoTam, "grande");
});

test("normalizarClips: ignora elementos que no son escenas y valores raros", () => {
  const r = normalizarClips([null, 5, { image: "x", caption: 3, textoPos: "lado", segundos: "mucho" }], 2);
  assert.equal(r.length, 1);
  assert.equal(r[0].caption, "");
  assert.equal(r[0].textoPos, undefined);
  assert.equal(r[0].segundos, 2);
});

test("duracionClip: foto, toma y clip vacío", () => {
  assert.equal(duracionClip(foto({ segundos: 4 })), 4);
  assert.equal(duracionClip(foto({ tipo: "toma", segundos: 9 })), 5);
  assert.equal(duracionClip(nuevoClip({ segundos: 4 })), 0);
});

test("duracionTotal y cierreDe: el cierre de 3 s entra si cabe", () => {
  assert.equal(duracionTotal(fotos(3)), 12);
  assert.equal(cierreDe(fotos(3)), 3);
  assert.equal(cierreDe(fotos(40)), 0);
  assert.equal(duracionTotal(fotos(40)), 120);
  assert.equal(cierreDe(fotos(39)), 3);
  assert.equal(duracionTotal([nuevoClip(), nuevoClip()]), 0);
  assert.equal(cierreDe([nuevoClip()]), 0);
});

test("validar: sin fotos", () => {
  assert.equal(validar([nuevoClip(), nuevoClip()]), "Agrega al menos una imagen a las escenas.");
});

test("validar: más de 2 minutos", () => {
  assert.equal(validar(fotos(45)), "Tu video dura 2:15. El máximo es 2:00: quita o acorta algún clip.");
});

test("validar: más de 4 tomas con IA", () => {
  const cinco = Array.from({ length: 5 }, () => foto({ tipo: "toma" }));
  assert.equal(validar(cinco), "Puedes marcar máximo 4 fotos con IA por video.");
  // una toma sin foto no cuenta
  assert.equal(validar([...cinco.slice(0, 4), nuevoClip({ tipo: "toma" })]), null);
});

test("validar: caso normal y justo 2:00", () => {
  assert.equal(validar(fotos(3)), null);
  assert.equal(validar(fotos(40)), null);
});

test("mover: cambia el orden sin tocar la lista original", () => {
  const [a, b, c] = fotos(3);
  const lista = [a, b, c];
  assert.deepEqual(mover(lista, 0, 2).map((x) => x.id), [b.id, c.id, a.id]);
  assert.deepEqual(mover(lista, 2, 0).map((x) => x.id), [c.id, a.id, b.id]);
  assert.deepEqual(lista.map((x) => x.id), [a.id, b.id, c.id]);
  assert.equal(mover(lista, 1, 1), lista);
  assert.equal(mover(lista, -1, 1), lista);
  assert.equal(mover(lista, 0, 3), lista);
});

test("duplicar: copia justo después con id nuevo", () => {
  const [a, b] = [foto({ caption: "hola", segundos: 7 }), foto()];
  const r = duplicar([a, b], 0);
  assert.equal(r.length, 3);
  assert.equal(r[0].id, a.id);
  assert.notEqual(r[1].id, a.id);
  assert.equal(r[1].caption, "hola");
  assert.equal(r[1].segundos, 7);
  assert.equal(r[1].image, a.image);
  assert.equal(r[2].id, b.id);
  assert.equal(duplicar([a, b], 9).length, 2);
});

test("duplicar: la copia guarda su foto aparte (sin compartir imageId)", () => {
  const a = foto({ imageId: "reel-1" });
  assert.equal(duplicar([a], 0)[1].imageId, undefined);
});

test("borrar: nunca deja la lista vacía", () => {
  const [a, b] = fotos(2);
  assert.deepEqual(borrar([a, b], 0).map((x) => x.id), [b.id]);
  const uno = borrar([a], 0);
  assert.equal(uno.length, 1);
  assert.equal(uno[0].image, "");
  assert.notEqual(uno[0].id, a.id);
  const igual = [a, b];
  assert.equal(borrar(igual, 5), igual);
});

test("cambiar: aplica cambios y acota los segundos", () => {
  const lista = fotos(2);
  assert.equal(cambiar(lista, 0, { segundos: 0.2 })[0].segundos, 1.5);
  assert.equal(cambiar(lista, 0, { segundos: 40 })[0].segundos, 15);
  assert.equal(cambiar(lista, 0, { segundos: Number.NaN })[0].segundos, 3);
  assert.equal(cambiar(lista, 1, { textoPos: "arriba" })[1].textoPos, "arriba");
  assert.equal(lista[0].segundos, 3);
  assert.equal(cambiar(lista, 7, { caption: "x" }), lista);
});

test("aEscenas: omite los vacíos y pone los valores por defecto del texto", () => {
  const a = foto({ caption: "uno", segundos: 4 });
  const b = foto({ caption: "dos", textoPos: "arriba", textoTam: "grande" });
  const r = aEscenas([a, nuevoClip(), b]);
  assert.deepEqual(r, [
    { imagen: "data:x", texto: "uno", textoPos: "abajo", textoTam: "normal", segundos: 4 },
    { imagen: "data:x", texto: "dos", textoPos: "arriba", textoTam: "grande", segundos: 8 },
  ]);
});

test("aEscenas: la toma dura 5 s; con clip lleva video, sin clip se queda como foto", () => {
  const t1 = foto({ tipo: "toma", segundos: 9 });
  const t2 = foto({ tipo: "toma" });
  const t3 = foto({ tipo: "toma" });
  const r = aEscenas([t1, t2, t3], { [t1.id]: "https://clip", [t2.id]: null });
  assert.equal(r[0].segundos, 5);
  assert.equal(r[0].video, "https://clip");
  assert.equal(r[1].segundos, 5);
  assert.equal(r[1].video, undefined);
  assert.equal(r[2].video, undefined);
});

test("ajustarAVoz: reparte las fotos para cubrir la voz", () => {
  const r = ajustarAVoz(fotos(4), 20);
  assert.deepEqual(r.map((c) => c.segundos), [5.125, 5.125, 5.125, 5.125]);
});

test("ajustarAVoz: no toca las tomas ni los clips vacíos", () => {
  const toma = foto({ tipo: "toma" });
  const vacio = nuevoClip();
  const r = ajustarAVoz([foto({ segundos: 3 }), toma, vacio, foto({ segundos: 3 })], 20);
  assert.deepEqual(r.map((c) => c.segundos), [7.75, toma.segundos, vacio.segundos, 7.75]);
  assert.equal(r[1].tipo, "toma");
});

test("ajustarAVoz: si la voz ya cabe no cambia nada; nunca pasa de 15 s por foto", () => {
  const lista = fotos(4);
  assert.equal(ajustarAVoz(lista, 10), lista);
  assert.deepEqual(ajustarAVoz(fotos(2), 100).map((c) => c.segundos), [15, 15]);
  const soloTomas = [foto({ tipo: "toma" })];
  assert.equal(ajustarAVoz(soloTomas, 30), soloTomas);
});

test("formatoTiempo", () => {
  assert.equal(formatoTiempo(134), "2:14");
  assert.equal(formatoTiempo(9), "0:09");
  assert.equal(formatoTiempo(120), "2:00");
  assert.equal(formatoTiempo(11.6), "0:12");
  assert.equal(formatoTiempo(0), "0:00");
});

test("normalizarClips: un borrador de antes del editor sin duración guardada conserva sus 3 s", () => {
  assert.equal(normalizarClips([{ image: "x", caption: "", prompt: "" }])[0].segundos, 3);
});
