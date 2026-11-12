import test from "node:test";
import assert from "node:assert/strict";
import {
  ajustarAVoz,
  aEscenas,
  borrar,
  cambiar,
  cierreDe,
  clipDeVideo,
  dividir,
  duplicar,
  duracionClip,
  duracionTotal,
  formatoTiempo,
  mover,
  normalizarClips,
  nuevoClip,
  ponerToma,
  recortar,
  rehacerToma,
  sustituir,
  tomasDistintas,
  tramo,
  validar,
  volverAnterior,
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

test("validar: más de 8 tomas con IA distintas", () => {
  const nueve = Array.from({ length: 9 }, (_, i) => foto({ tipo: "toma", image: `data:${i}` }));
  assert.equal(validar(nueve), "Puedes animar con IA máximo 8 fotos distintas por video.");
  // una toma sin foto no cuenta
  assert.equal(validar([...nueve.slice(0, 8), nuevoClip({ tipo: "toma" })]), null);
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
  const r = aEscenas([t1, t2, t3], { tomas: { [t1.id]: "https://clip", [t2.id]: null } });
  assert.equal(r[0].segundos, 5);
  assert.deepEqual(r[0].video, { src: "https://clip", inicio: 0, fin: 5, velocidad: 1, sonido: false });
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

// ---------- Clips de video propio ----------

const video = (extra: Partial<Clip> = {}): Clip => ({ ...clipDeVideo({ archivoId: "reelvid-1", duracion: 10, portada: "data:p" }), ...extra });

test("clipDeVideo: recorte completo, velocidad normal y con sonido", () => {
  const c = clipDeVideo({ archivoId: "v1", duracion: 12.4, portada: "data:p" });
  assert.equal(c.tipo, "video");
  assert.equal(c.archivoId, "v1");
  assert.equal(c.duracionOriginal, 12.4);
  assert.deepEqual(tramo(c), { inicio: 0, fin: 12.4 });
  assert.equal(c.velocidad, 1);
  assert.ok(!c.sinSonido);
  assert.equal(c.image, "data:p");
  assert.ok(c.id);
});

test("duracionClip de un video: recorte entre velocidad", () => {
  assert.equal(duracionClip(video()), 10);
  assert.equal(duracionClip(video({ inicio: 2, fin: 8, velocidad: 2 })), 3);
  assert.equal(duracionClip(video({ inicio: 2, fin: 8, velocidad: 0.5 })), 12);
  assert.equal(duracionClip(video({ image: "" })), 10); // aunque la portada no haya cargado
  assert.equal(duracionClip(video({ duracionOriginal: 0 })), 0);
  assert.equal(duracionClip(video({ duracionOriginal: undefined })), 0);
  assert.equal(duracionClip(video({ velocidad: 7 })), 10); // velocidad imposible: normal
});

test("tramo: se acota al original", () => {
  assert.deepEqual(tramo(video({ inicio: -3, fin: 99 })), { inicio: 0, fin: 10 });
  assert.deepEqual(tramo(video({ inicio: 8, fin: 2 })), { inicio: 0, fin: 10 });
});

test("recortar: acota y nunca deja menos de 1 s", () => {
  const lista = [video()];
  assert.deepEqual(tramo(recortar(lista, 0, 2, 8)[0]), { inicio: 2, fin: 8 });
  assert.deepEqual(tramo(recortar(lista, 0, -5, 40)[0]), { inicio: 0, fin: 10 });
  assert.deepEqual(tramo(recortar(lista, 0, 4, 4.2)[0]), { inicio: 4, fin: 5 });
  assert.deepEqual(tramo(recortar(lista, 0, 9.8, 10)[0]), { inicio: 9, fin: 10 });
  assert.deepEqual(tramo(lista[0]), { inicio: 0, fin: 10 }); // no modifica lo que recibe
  const fotos1 = [foto()];
  assert.equal(recortar(fotos1, 0, 1, 2), fotos1);
  assert.equal(recortar(lista, 5, 1, 2), lista);
});

test("dividir: dos clips seguidos con el mismo archivo y recortes contiguos", () => {
  const v = video({ inicio: 2, fin: 8, caption: "Hola", velocidad: 2, sinSonido: true });
  const r = dividir([foto(), v, foto()], 1, 5);
  assert.equal(r.length, 4);
  assert.deepEqual([tramo(r[1]), tramo(r[2])], [{ inicio: 2, fin: 5 }, { inicio: 5, fin: 8 }]);
  assert.equal(r[1].id, v.id);
  assert.notEqual(r[2].id, v.id);
  assert.equal(r[2].archivoId, "reelvid-1");
  assert.equal(r[2].velocidad, 2);
  assert.equal(r[2].sinSonido, true);
  assert.equal(r[1].caption, "Hola");
  assert.equal(r[2].caption, ""); // el texto no se repite
  assert.equal(r[2].imageId, undefined);
});

test("dividir: no deja mitades de menos de 1 s ni divide fotos o tomas", () => {
  const lista = [video({ inicio: 2, fin: 8 })];
  assert.equal(dividir(lista, 0, 2.5), lista);
  assert.equal(dividir(lista, 0, 7.5), lista);
  assert.equal(dividir(lista, 0, 20), lista);
  const otros = [foto(), foto({ tipo: "toma" })];
  assert.equal(dividir(otros, 0, 1.5), otros);
  assert.equal(dividir(otros, 1, 2.5), otros);
});

test("sustituir: el clip nuevo hereda lugar, id, texto y estilo del texto", () => {
  const viejo = foto({ caption: "Promo", textoPos: "arriba", textoTam: "grande" });
  const r = sustituir([foto(), viejo], 1, video());
  assert.equal(r[1].tipo, "video");
  assert.equal(r[1].id, viejo.id);
  assert.equal(r[1].caption, "Promo");
  assert.equal(r[1].textoPos, "arriba");
  assert.equal(r[1].textoTam, "grande");
  assert.equal(r[1].archivoId, "reelvid-1");
  assert.equal(r[1].imageId, undefined);
  const igual = [foto()];
  assert.equal(sustituir(igual, 4, video()), igual);
});

test("duplicar un video: comparte el archivo (no se copia)", () => {
  const r = duplicar([video({ inicio: 1, fin: 4 })], 0);
  assert.equal(r[1].archivoId, "reelvid-1");
  assert.deepEqual(tramo(r[1]), { inicio: 1, fin: 4 });
});

test("validar y total con videos", () => {
  assert.equal(duracionTotal([foto({ segundos: 3 }), video({ inicio: 2, fin: 8, velocidad: 2 })]), 9); // 3 + 3 + cierre
  assert.equal(validar([video()]), null); // un video solo ya es un video
  assert.equal(validar([video({ duracionOriginal: 0.6, fin: 0.6 })]), "Un video quedó de menos de 1 segundo: alarga su recorte.");
  assert.equal(validar(Array.from({ length: 13 }, () => video())), "Tu video dura 2:10. El máximo es 2:00: quita o acorta algún clip.");
});

test("aEscenas con videos: con su archivo lleva el tramo; sin archivo se ve la portada", () => {
  const v = video({ inicio: 2, fin: 8, velocidad: 2, caption: "Hola" });
  const mudo = video({ archivoId: "reelvid-2", sinSonido: true });
  const falta = video({ archivoId: "reelvid-3" });
  const r = aEscenas([v, mudo, falta], { videos: { "reelvid-1": "blob:a", "reelvid-2": "blob:b" } });
  assert.deepEqual(r[0], { imagen: "data:p", texto: "Hola", textoPos: "abajo", textoTam: "normal", segundos: 3, video: { src: "blob:a", inicio: 2, fin: 8, velocidad: 2, sonido: true } });
  assert.equal(r[1].video?.sonido, false);
  assert.equal(r[2].video, undefined);
  assert.equal(r[2].segundos, 10);
});

test("normalizarClips conserva los videos y corrige valores imposibles", () => {
  const [a] = normalizarClips([video({ inicio: 2, fin: 8, velocidad: 1.5, sinSonido: true })]);
  assert.equal(a.tipo, "video");
  assert.equal(a.archivoId, "reelvid-1");
  assert.equal(a.duracionOriginal, 10);
  assert.deepEqual(tramo(a), { inicio: 2, fin: 8 });
  assert.equal(a.velocidad, 1.5);
  assert.equal(a.sinSonido, true);
  const [b] = normalizarClips([{ ...video(), velocidad: 7, inicio: 9, fin: 3 }]);
  assert.equal(b.velocidad, 1);
  assert.deepEqual(tramo(b), { inicio: 0, fin: 10 });
  // un «video» sin archivo guardado vuelve a ser un clip de foto
  const [c] = normalizarClips([{ id: "x", tipo: "video", image: "", caption: "", prompt: "", segundos: 3 }]);
  assert.equal(c.tipo, "foto");
});

test("ajustarAVoz con videos: no los toca y los descuenta", () => {
  const v = video({ inicio: 0, fin: 6 });
  const r = ajustarAVoz([foto({ segundos: 3 }), v, foto({ segundos: 3 })], 20);
  assert.deepEqual(r.map((c) => c.segundos), [7.25, v.segundos, 7.25]);
  assert.deepEqual(tramo(r[1]), { inicio: 0, fin: 6 });
});

test("cambiar: la velocidad solo acepta las cuatro permitidas", () => {
  assert.equal(cambiar([video()], 0, { velocidad: 2 })[0].velocidad, 2);
  assert.equal(cambiar([video()], 0, { velocidad: 3 })[0].velocidad, 1);
});

// ---------- IA por clip y estirar ----------

const toma = (extra: Partial<Clip> = {}): Clip => foto({ tipo: "toma", ...extra });

test("estirar una toma: cámara lenta y repetir", () => {
  assert.equal(duracionClip(toma()), 5);
  assert.equal(duracionClip(toma({ reproduccion: "lenta" })), 10);
  assert.equal(duracionClip(toma({ reproduccion: "repetir2" })), 10);
  assert.equal(duracionClip(toma({ reproduccion: "repetir3" })), 15);
  assert.equal(duracionClip(foto({ reproduccion: "lenta", segundos: 4 })), 4); // en una foto no aplica
});

test("aEscenas de una toma estirada", () => {
  const a = toma({ reproduccion: "lenta" });
  const b = toma({ reproduccion: "repetir3" });
  const r = aEscenas([a, b], { tomas: { [a.id]: "u1", [b.id]: "u2" } });
  assert.deepEqual(r[0].video, { src: "u1", inicio: 0, fin: 5, velocidad: 0.5, sonido: false });
  assert.equal(r[0].segundos, 10);
  assert.deepEqual(r[1].video, { src: "u2", inicio: 0, fin: 5, velocidad: 1, sonido: false, repetir: 3 });
  assert.equal(r[1].segundos, 15);
});

test("tomasDistintas: los duplicados y las mitades comparten toma", () => {
  const a = toma({ trabajoId: "t1" });
  const copia = { ...a, id: "otro" };
  const b = toma({ image: "data:b" });
  const mismaFoto = toma({ image: "data:b" }); // misma foto y movimiento, sin generar: es la misma toma
  const otroMov = toma({ image: "data:b", movimiento: "zoom" });
  assert.equal(tomasDistintas([a, copia, b, mismaFoto, otroMov, foto(), nuevoClip({ tipo: "toma" })]), 3);
});

test("ponerToma, rehacerToma y volverAnterior", () => {
  let lista = ponerToma([toma()], 0, "t1");
  assert.equal(lista[0].trabajoId, "t1");
  // rehacer: sube la variación; la toma actual sigue puesta hasta que llegue la nueva
  lista = rehacerToma(lista, 0);
  assert.equal(lista[0].variacion, 1);
  assert.equal(lista[0].trabajoId, "t1");
  lista = ponerToma(lista, 0, "t2");
  assert.equal(lista[0].trabajoId, "t2");
  assert.equal(lista[0].anteriorTrabajoId, "t1");
  lista = volverAnterior(lista, 0);
  assert.equal(lista[0].trabajoId, "t1");
  assert.equal(lista[0].anteriorTrabajoId, "t2");
  const sin = [toma()];
  assert.equal(volverAnterior(sin, 0), sin);
  assert.equal(ponerToma(sin, 3, "x"), sin);
});

test("cambiar la foto o el movimiento de un clip animado descarta su toma", () => {
  const c = toma({ trabajoId: "t1", anteriorTrabajoId: "t0", variacion: 2, movimiento: "zoom" });
  let r = cambiar([c], 0, { movimiento: "paneo" })[0];
  assert.equal(r.trabajoId, undefined);
  assert.equal(r.anteriorTrabajoId, undefined);
  assert.equal(r.variacion, undefined);
  r = cambiar([c], 0, { image: "data:otra" })[0];
  assert.equal(r.trabajoId, undefined);
  r = cambiar([c], 0, { tipo: "foto" })[0];
  assert.equal(r.trabajoId, undefined);
  // lo que no cambia el clip generado se conserva
  r = cambiar([c], 0, { caption: "Hola", reproduccion: "lenta", movimiento: "zoom" })[0];
  assert.equal(r.trabajoId, "t1");
  assert.equal(r.variacion, 2);
});

test("duplicar una toma generada comparte su toma (no se paga otra vez)", () => {
  const r = duplicar([toma({ trabajoId: "t1" })], 0);
  assert.equal(r[1].trabajoId, "t1");
  assert.equal(tomasDistintas(r), 1);
});

test("normalizarClips conserva los datos de la toma", () => {
  const [a] = normalizarClips([toma({ trabajoId: "t1", anteriorTrabajoId: "t0", variacion: 3, reproduccion: "repetir2" })]);
  assert.equal(a.trabajoId, "t1");
  assert.equal(a.anteriorTrabajoId, "t0");
  assert.equal(a.variacion, 3);
  assert.equal(a.reproduccion, "repetir2");
  const [b] = normalizarClips([{ ...toma(), reproduccion: "al-reves", variacion: -4 }]);
  assert.equal(b.reproduccion, undefined);
  assert.equal(b.variacion, undefined);
});
