import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GUIADO_VACIO,
  MAX_LINEA_GUIADA,
  aSecuencia,
  agregarFotos,
  alternarAnimar,
  avanzar,
  faltaPara,
  limpiarTextoGuiado,
  mensajeNova,
  moverFoto,
  quitarFoto,
  regresar,
  type EstadoGuiado,
  type FotoGuiada,
} from "./video-guiado";

const fotos = (n: number, desde = 1): FotoGuiada[] => Array.from({ length: n }, (_, i) => ({ id: `f${desde + i}`, src: `data:image/jpeg;base64,${desde + i}` }));
const con = (n: number, extra: Partial<EstadoGuiado> = {}): EstadoGuiado => ({ ...GUIADO_VACIO, fotos: fotos(n), ...extra });

test("agregarFotos: entran hasta 8 y avisa cuántas sobraron", () => {
  const r = agregarFotos(con(6), fotos(5, 7));
  assert.equal(r.estado.fotos.length, 8);
  assert.equal(r.sobraron, 3);
  assert.deepEqual(r.estado.fotos.map((f) => f.id), ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"]);
});

test("agregarFotos: no repite una foto que ya estaba", () => {
  const r = agregarFotos(con(2), [{ id: "f2", src: "x" }, { id: "f9", src: "y" }]);
  assert.deepEqual(r.estado.fotos.map((f) => f.id), ["f1", "f2", "f9"]);
  assert.equal(r.sobraron, 0);
});

test("quitarFoto: se lleva también su línea y su marca de animar", () => {
  const e = quitarFoto(con(3, { lineas: { f1: "uno", f2: "dos" }, animar: ["f2", "f3"] }), "f2");
  assert.deepEqual(e.fotos.map((f) => f.id), ["f1", "f3"]);
  assert.deepEqual(e.lineas, { f1: "uno" });
  assert.deepEqual(e.animar, ["f3"]);
});

test("moverFoto: cambia de lugar con la vecina y no hace nada en los extremos", () => {
  assert.deepEqual(moverFoto(con(3), "f2", -1).fotos.map((f) => f.id), ["f2", "f1", "f3"]);
  assert.deepEqual(moverFoto(con(3), "f2", 1).fotos.map((f) => f.id), ["f1", "f3", "f2"]);
  assert.deepEqual(moverFoto(con(3), "f1", -1).fotos.map((f) => f.id), ["f1", "f2", "f3"]);
  assert.deepEqual(moverFoto(con(3), "f3", 1).fotos.map((f) => f.id), ["f1", "f2", "f3"]);
});

test("faltaPara: dice qué falta en cada paso, o null si se puede seguir", () => {
  assert.equal(faltaPara(con(1)), "Sube al menos 2 fotos.");
  assert.equal(faltaPara(con(2)), null);
  assert.equal(faltaPara(con(2, { paso: 2, tema: "   " })), "Escribe de qué trata el video.");
  assert.equal(faltaPara(con(2, { paso: 2, tema: "Promo de tortas" })), null);
  assert.equal(faltaPara(con(2, { paso: 3 })), null); // una línea vacía no detiene
});

test("avanzar y regresar: no se saltan lo que falta, no se salen de 1 a 4 y no borran nada", () => {
  assert.equal(avanzar(con(1)).paso, 1);
  const dos = avanzar(con(2));
  assert.equal(dos.paso, 2);
  assert.equal(avanzar(dos).paso, 2); // falta el tema
  const tres = avanzar({ ...dos, tema: "Promo" });
  assert.equal(tres.paso, 3);
  assert.equal(avanzar(tres).paso, 4);
  assert.equal(avanzar(avanzar(tres)).paso, 4);
  const atras = regresar({ ...tres, lineas: { f1: "torta" } });
  assert.equal(atras.paso, 2);
  assert.equal(atras.tema, "Promo");
  assert.deepEqual(atras.lineas, { f1: "torta" });
  assert.equal(atras.fotos.length, 2);
  assert.equal(regresar(con(2)).paso, 1);
});

test("alternarAnimar: marca y desmarca, sin pasarse de las tomas que quedan", () => {
  const una = alternarAnimar(con(3), "f1", 1);
  assert.deepEqual(una.animar, ["f1"]);
  assert.deepEqual(alternarAnimar(una, "f2", 1).animar, ["f1"]); // ya no queda otra
  assert.deepEqual(alternarAnimar(una, "f1", 1).animar, []); // desmarcar siempre se puede
  assert.deepEqual(alternarAnimar(con(3), "f1", 0).animar, []);
  assert.deepEqual(alternarAnimar(una, "f2").animar, ["f1", "f2"]); // sin tope conocido
  assert.deepEqual(alternarAnimar(con(3), "no-existe").animar, []);
});

test("mensajeNova: una instrucción corta por paso", () => {
  assert.equal(mensajeNova(con(0)), "Sube las fotos de tu video, en el orden en que quieres que salgan.");
  assert.equal(mensajeNova(con(2, { paso: 2 })), "Cuéntame en una frase de qué es el video.");
  assert.equal(mensajeNova(con(2, { paso: 3 })), "Escribe en pocas palabras qué se ve en cada foto. Con eso escribo el guion.");
  assert.equal(mensajeNova(con(2, { paso: 4 })), "Listo. Tu video ya está en el editor.");
});

test("mensajeNova: avisa del máximo de fotos y de que no quedan animaciones", () => {
  assert.match(mensajeNova(con(8), { sobraron: 2 }), /El máximo son 8 fotos\.$/);
  assert.doesNotMatch(mensajeNova(con(8), { sobraron: 0 }), /máximo/);
  assert.match(mensajeNova(con(2, { paso: 3 }), { tomasQuedan: 0 }), /Hoy no te quedan animaciones con IA\.$/);
  assert.doesNotMatch(mensajeNova(con(2, { paso: 3 }), { tomasQuedan: 2 }), /no te quedan/);
  assert.doesNotMatch(mensajeNova(con(2, { paso: 3 })), /no te quedan/);
});

test("aSecuencia: una línea por foto en orden; la vacía viaja como «Foto N» y la larga se recorta", () => {
  const larga = "a".repeat(MAX_LINEA_GUIADA + 30);
  const s = aSecuencia(con(3, { tema: "  Promo de tortas  ", formato: "1:1", lineas: { f1: "  torta   cubana ", f3: larga }, animar: ["f3"] }));
  assert.equal(s.tema, "Promo de tortas");
  assert.equal(s.formato, "1:1");
  assert.deepEqual(s.fotos, ["data:image/jpeg;base64,1", "data:image/jpeg;base64,2", "data:image/jpeg;base64,3"]);
  assert.deepEqual(s.momentos, ["torta cubana", "Foto 2", "a".repeat(MAX_LINEA_GUIADA)]);
  assert.deepEqual(s.animar, [false, false, true]);
});

test("limpiarTextoGuiado: lo guardado que no sirve vuelve a lo de fábrica, sin romperse", () => {
  assert.deepEqual(limpiarTextoGuiado(null), { tema: "", formato: "9:16" });
  assert.deepEqual(limpiarTextoGuiado({ tema: 5, formato: "raro" }), { tema: "", formato: "9:16" });
  assert.deepEqual(limpiarTextoGuiado({ tema: "Promo", formato: "16:9" }), { tema: "Promo", formato: "16:9" });
  assert.equal(limpiarTextoGuiado({ tema: "x".repeat(500), formato: "1:1" }).tema.length, 200);
});
