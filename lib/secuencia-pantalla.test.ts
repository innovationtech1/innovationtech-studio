import { test } from "node:test";
import assert from "node:assert/strict";
import { DURACIONES_SECUENCIA, ESTILOS_FOTO, MAX_FOTOS, MAX_MOMENTO, MIN_FOTOS } from "./secuencia";
import { MAX_ORDEN } from "./director";
import {
  AVISO_SIN_GUARDAR,
  MIN_FOTOS_VIDEO,
  agregarIdea,
  fotosParaVideo,
  moverIdea,
  promptDeFoto,
  quedanDe,
  quitarIdea,
  textoConfirmarFotos,
  textoProgreso,
} from "./secuencia-pantalla";
import { EN, EN_PATTERNS } from "./locales/en";

const sufijo = (id: string) => ESTILOS_FOTO.find((e) => e.id === id)!.sufijo;
const lista = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, momento: `M${i}`, prompt: `p${i}` }));

test("moverIdea: sube o baja una idea sin salirse de la lista", () => {
  const l = lista(3);
  assert.deepEqual(moverIdea(l, 1, -1).map((x) => x.id), ["i1", "i0", "i2"]);
  assert.deepEqual(moverIdea(l, 1, 1).map((x) => x.id), ["i0", "i2", "i1"]);
  assert.equal(moverIdea(l, 0, -1), l); // la primera no sube
  assert.equal(moverIdea(l, 2, 1), l); // la última no baja
  assert.deepEqual(l.map((x) => x.id), ["i0", "i1", "i2"]); // no cambia la original
});

test("agregarIdea y quitarIdea: de 1 a 8 momentos", () => {
  assert.equal(agregarIdea(lista(3), { id: "n", momento: "", prompt: "" }).length, 4);
  const llena = lista(MAX_FOTOS);
  assert.equal(agregarIdea(llena, { id: "n", momento: "", prompt: "" }), llena);
  assert.deepEqual(quitarIdea(lista(3), 1).map((x) => x.id), ["i0", "i2"]);
  const una = lista(1);
  assert.equal(quitarIdea(una, 0), una); // siempre queda al menos un momento
});

test("promptDeFoto: usa el estilo elegido aunque el prompt traiga el de antes; sin prompt arma uno con el momento", () => {
  const conRealista = `Hands kneading dough, ${sufijo("realista")}`;
  assert.equal(promptDeFoto({ momento: "La masa", prompt: conRealista }, "Panadería", "calido"), `Hands kneading dough, ${sufijo("calido")}`);
  assert.equal(promptDeFoto({ momento: "La masa", prompt: conRealista }, "Panadería", "realista"), conRealista);
  assert.equal(promptDeFoto({ momento: "La masa", prompt: "Hands kneading dough" }, "x", "estudio"), `Hands kneading dough, ${sufijo("estudio")}`);
  assert.equal(promptDeFoto({ momento: "El cliente feliz", prompt: "  " }, "Un día en mi panadería", "colorido"), `El cliente feliz, Un día en mi panadería, ${sufijo("colorido")}`);
  assert.equal(promptDeFoto({ momento: " ", prompt: "" }, " ", "realista"), "");
});

test("textoConfirmarFotos: dice cuántas imágenes usa y cuántas quedan (sin «te quedan» con cuentas apagadas)", () => {
  assert.equal(textoConfirmarFotos(5, 40), "Esto usa 5 imágenes de tu límite (te quedan 40). ¿Las creo?");
  assert.equal(textoConfirmarFotos(5), "Esto usa 5 imágenes de tu límite. ¿Las creo?");
  assert.equal(textoConfirmarFotos(1, 1), "Esto usa 1 imagen de tu límite (te queda 1). ¿La creo?");
  assert.equal(textoConfirmarFotos(1), "Esto usa 1 imagen de tu límite. ¿La creo?");
});

test("textoProgreso", () => {
  assert.equal(textoProgreso(2, 5), "Foto 2 de 5…");
});

test("quedanDe: lo del mes más el saldo; undefined sin cuenta o si el plan no lo tiene", () => {
  const c = { limites: { imagenes: 50 }, uso: { imagenes: 12 }, saldo: { imagenes: 5 } };
  assert.equal(quedanDe(c, "imagenes"), 43);
  assert.equal(quedanDe({ limites: { imagenes: 10 }, uso: { imagenes: 15 }, saldo: {} }, "imagenes"), 0);
  assert.equal(quedanDe({ limites: {}, uso: {}, saldo: {} }, "imagenes"), undefined);
  assert.equal(quedanDe(null, "imagenes"), undefined);
});

test("fotosParaVideo: solo las ideas con foto, en orden; hacen falta al menos 2", () => {
  const ideas = [
    { id: "a", momento: "A", prompt: "", foto: "fa" },
    { id: "b", momento: "B", prompt: "" },
    { id: "c", momento: "C", prompt: "", foto: "fc" },
  ];
  const urls: Record<string, string> = { fa: "data:a", fc: "data:c" };
  assert.deepEqual(fotosParaVideo(ideas, urls), { momentos: ["A", "C"], fotos: ["data:a", "data:c"] });
  // Una foto que aún no se carga del aparato no cuenta
  assert.deepEqual(fotosParaVideo(ideas, { fa: "data:a" }), { momentos: ["A"], fotos: ["data:a"] });
  assert.deepEqual(fotosParaVideo([{ id: "x", momento: " ", prompt: "", foto: "fx" }], { fx: "data:x" }).momentos, ["Foto 1"]);
  assert.equal(MIN_FOTOS_VIDEO, 2);
});

const traducir = (s: string) => {
  if (EN[s]) return EN[s];
  for (const [re, out] of EN_PATTERNS) if (re.test(s)) return s.replace(re, out);
  return null;
};

test("los textos de la pantalla «Secuencia de fotos» tienen su traducción al inglés", () => {
  const textos = [
    "Video",
    "Secuencia de fotos",
    "Crear secuencia de fotos",
    "La IA crea de 3 a 8 fotos distintas que cuentan tu historia en orden. Después NOVA arma el video con voz.",
    "¿De qué trata la historia?",
    "Ej.: un día en mi taquería, desde que llega la carne hasta que el cliente prueba su torta",
    "Cuántas fotos",
    "Estilo",
    "Formato",
    "Crear ideas",
    "Creando las ideas…",
    "Escribe de qué trata la historia.",
    "Momentos de la historia",
    "Momento",
    "Ver detalle",
    "Ocultar detalle",
    "Descripción de la foto (en inglés)",
    "Subir",
    "Bajar",
    "Quitar",
    "Agregar momento",
    "Crear las fotos",
    "Rehacer",
    "No se pudo crear esta foto.",
    "Descargar",
    "Nueva secuencia",
    "¿Empezar una secuencia nueva? Se borran la historia, las ideas y las fotos de aquí (las de la Galería se quedan).",
    "¿Crear ideas nuevas? Se reemplazan las ideas y las fotos de aquí (las de la Galería se quedan).",
    "Hacer el video con NOVA",
    "Crea al menos 2 fotos para hacer el video.",
    "Algunas fotos no se pudieron crear. Toca «Rehacer» en cada una.",
    "Escribe el momento o la descripción de esta foto.",
    "Todas las fotos ya están creadas.",
    "Esto usa 5 imágenes de tu límite (te quedan 40). ¿Las creo?",
    "Esto usa 1 imagen de tu límite (te queda 1). ¿La creo?",
    "Esto usa 3 imágenes de tu límite. ¿Las creo?",
    "Esto usa 1 imagen de tu límite. ¿La creo?",
    "Foto 2 de 5…",
    ...ESTILOS_FOTO.map((e) => e.nombre),
    AVISO_SIN_GUARDAR,
    // Errores de /api/text (modos secuencia y guion_secuencia) y de lib/secuencia.ts
    `La historia es muy larga (máximo ${MAX_ORDEN} caracteres).`,
    `Elige de ${MIN_FOTOS} a ${MAX_FOTOS} fotos.`,
    "Elige un estilo de fotos.",
    `Elige una duración de ${DURACIONES_SECUENCIA.join(", ")} segundos.`,
    `Faltan los momentos de las fotos (de 1 a ${MAX_FOTOS}, cada uno de máximo ${MAX_MOMENTO} caracteres).`,
    "La IA no pudo armar la secuencia. Intenta de nuevo.",
  ];
  const faltan = textos.filter((t) => !traducir(t));
  assert.deepEqual(faltan, []);
});
