import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_FOTO, MIN_FOTO, duracionTotal, cierreDe, nuevoClip } from "./linea-tiempo";
import { DURACIONES_SECUENCIA, MAX_MOMENTO } from "./secuencia";
import {
  clipsDeSecuencia,
  decidirEntrada,
  duracionParaFotos,
  limpiarEntrante,
  repartirEnFotos,
  segundosPorFoto,
  textoConfirmarVoz,
  tieneContenido,
} from "./secuencia-video";
import { EN, EN_PATTERNS } from "./locales/en";

test("duracionParaFotos: 15 s por defecto, o la más cercana en la que cada foto dura al menos 2 s", () => {
  for (const n of [2, 3, 4, 5, 6, 7]) assert.equal(duracionParaFotos(n), 15);
  assert.equal(duracionParaFotos(8), 20); // 15/8 < 2 s por foto
  for (let n = 2; n <= 8; n++) assert.ok((DURACIONES_SECUENCIA as readonly number[]).includes(duracionParaFotos(n)));
});

test("segundosPorFoto: reparte la duración entre las fotos, dentro de lo que acepta un clip", () => {
  assert.equal(segundosPorFoto(15, 5), 3);
  assert.equal(segundosPorFoto(20, 3), 6.7);
  assert.equal(segundosPorFoto(30, 1), MAX_FOTO);
  assert.equal(segundosPorFoto(10, 8), MIN_FOTO);
  assert.equal(segundosPorFoto(15, 0), MAX_FOTO);
});

test("clipsDeSecuencia: un clip de foto por foto, en orden, con su momento y la duración repartida", () => {
  const clips = clipsDeSecuencia(["data:a", "https://x/b.jpg", "data:c"], ["Llega", "Cocina", "Prueba"], 15);
  assert.equal(clips.length, 3);
  assert.deepEqual(clips.map((c) => c.image), ["data:a", "https://x/b.jpg", "data:c"]);
  assert.deepEqual(clips.map((c) => c.prompt), ["Llega", "Cocina", "Prueba"]);
  assert.ok(clips.every((c) => c.tipo === "foto" && c.segundos === 5 && !c.imageId && c.caption === ""));
  assert.equal(new Set(clips.map((c) => c.id)).size, 3); // ids distintos
  assert.equal(duracionTotal(clips) - cierreDe(clips), 15);
});

test("repartirEnFotos: cambia solo la duración de las fotos (no tomas ni videos)", () => {
  const foto = nuevoClip({ image: "data:a", segundos: 3 });
  const toma = nuevoClip({ image: "data:b", tipo: "toma", segundos: 3 });
  const vacio = nuevoClip({ segundos: 3 });
  const r = repartirEnFotos([foto, toma, vacio], 20);
  assert.equal(r[0].segundos, 15); // 20 s entre 1 foto → el máximo de un clip
  assert.equal(r[1], toma);
  assert.equal(r[2], vacio);
  const dos = repartirEnFotos([foto, { ...foto, id: "otra" }], 10);
  assert.deepEqual(dos.map((c) => c.segundos), [5, 5]);
});

test("tieneContenido: fotos, fotos guardadas, videos o guion cuentan; los clips vacíos no", () => {
  assert.equal(tieneContenido([nuevoClip(), nuevoClip()], ""), false);
  assert.equal(tieneContenido(null, undefined), false);
  assert.equal(tieneContenido("basura", "   "), false);
  assert.equal(tieneContenido([nuevoClip({ image: "data:a" })], ""), true);
  assert.equal(tieneContenido([{ ...nuevoClip(), imageId: "reel-1" }], ""), true); // la foto sigue en el aparato
  assert.equal(tieneContenido([{ ...nuevoClip(), tipo: "video", archivoId: "v1" }], ""), true);
  assert.equal(tieneContenido([nuevoClip()], "Hola, esto es un guion"), true);
});

test("decidirEntrada: sin contenido se carga directo; con contenido se pregunta y «Crear uno nuevo» solo si cabe", () => {
  assert.deepEqual(decidirEntrada({ hayContenido: false, proyectos: 3, max: 20 }), { preguntar: false });
  assert.deepEqual(decidirEntrada({ hayContenido: true, proyectos: 3, max: 20 }), { preguntar: true, puedeNuevo: true });
  assert.deepEqual(decidirEntrada({ hayContenido: true, proyectos: 20, max: 20 }), { preguntar: true, puedeNuevo: false });
  // Sin almacenamiento (0 proyectos guardados) no se pueden crear videos: solo reemplazar
  assert.deepEqual(decidirEntrada({ hayContenido: true, proyectos: 0, max: 20 }), { preguntar: true, puedeNuevo: false });
});

test("limpiarEntrante: deja de 2 a 8 fotos, un momento por foto y un formato válido", () => {
  assert.equal(limpiarEntrante(null), null);
  assert.equal(limpiarEntrante({ tema: "x", momentos: ["a"], fotos: ["data:a"], formato: "9:16", n: 1 }), null); // menos de 2 fotos
  const r = limpiarEntrante({
    tema: "  Un día en la taquería  ",
    momentos: ["Llega la carne", "  ", "x".repeat(200)],
    fotos: ["data:a", "data:b", "data:c", "", 5, "data:d", "data:e", "data:f", "data:g", "data:h", "data:i"],
    formato: "4:3",
    n: 7,
  });
  assert.ok(r);
  assert.equal(r.tema, "Un día en la taquería");
  assert.equal(r.fotos.length, 8);
  assert.deepEqual(r.fotos.slice(0, 4), ["data:a", "data:b", "data:c", "data:d"]);
  assert.equal(r.momentos.length, 8);
  assert.equal(r.momentos[0], "Llega la carne");
  assert.equal(r.momentos[1], "Foto 2");
  assert.equal(r.momentos[2].length, MAX_MOMENTO);
  assert.equal(r.momentos[7], "Foto 8");
  assert.equal(r.formato, "9:16");
  assert.equal(r.n, 7);
  assert.equal(limpiarEntrante({ tema: "", momentos: [], fotos: ["data:a", "data:b"], formato: "16:9", n: 1 })?.formato, "16:9");
});

test("textoConfirmarVoz: con y sin lo que le queda", () => {
  assert.equal(textoConfirmarVoz(4), "Generar la voz usa 1 voz en off de tu plan (te quedan 4). ¿La genero?");
  assert.equal(textoConfirmarVoz(1), "Generar la voz usa 1 voz en off de tu plan (te queda 1). ¿La genero?");
  assert.equal(textoConfirmarVoz(undefined), "Generar la voz usa 1 voz en off de tu plan. ¿La genero?");
});

const traducir = (s: string) => {
  if (EN[s]) return EN[s];
  for (const [re, out] of EN_PATTERNS) if (re.test(s)) return s.replace(re, out);
  return null;
};

test("los textos de «Hacer el video con NOVA» tienen su traducción al inglés", () => {
  const textos = [
    "¿Reemplazo el video abierto o creo uno nuevo?",
    "Crear uno nuevo",
    "Reemplazar",
    "Cancelar",
    "Ya tienes 20 videos guardados: solo se puede reemplazar el abierto (o borra alguno).",
    "Video de NOVA",
    "NOVA está escribiendo el guion…",
    "Duración de la voz",
    "Escribir el guion otra vez",
    "NOVA escribió el guion. Puedes cambiarlo en «Sonido».",
    "Sí, generarla",
    "Ahora no",
    "NOVA está generando la voz…",
    "Intentar otra vez",
    "Tu plan no incluye voz en off. El guion quedó listo en «Sonido»: puedes leerlo tú o mejorar tu plan.",
    "Si prefieres, elige otra voz en «Sonido» y toca «Generar voz».",
    "Marca «Con IA» en las fotos que quieras animar y presiona «Generar con IA». Después graba el video.",
    "Ir a los clips",
    "Entendido",
    "La voz está lista.",
    "NOVA no pudo escribir el guion. Intenta de nuevo.",
    "Espera a que termine la subida a Drive y vuelve a tocar «Hacer el video con NOVA».",
    "Ya no te quedan voces en off este mes.",
    "Mi cuenta",
    "Volver al video anterior",
    textoConfirmarVoz(4),
    textoConfirmarVoz(1),
    textoConfirmarVoz(undefined),
  ];
  for (const s of textos) assert.ok(traducir(s), `Falta la traducción de: ${s}`);
});
