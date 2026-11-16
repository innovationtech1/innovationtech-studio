import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DURACIONES_SECUENCIA,
  ESTILOS_FOTO,
  MAX_FOTOS,
  MIN_FOTOS,
  leerSecuencia,
  limpiarGuion,
  palabrasGuion,
  promptGuion,
  promptSecuencia,
} from "./secuencia";
import { PERSONA_NOVA } from "./nova";

const sufijo = (id: string) => ESTILOS_FOTO.find((e) => e.id === id)!.sufijo;

const IDEAS = [
  { momento: "La masa", prompt: "Close-up of hands kneading fresh dough on a floured wooden table" },
  { momento: "Al horno", prompt: "Golden bread loaves baking inside a glowing brick oven" },
  { momento: "En la vitrina", prompt: "Freshly baked pastries arranged in a bakery display case at sunrise" },
  { momento: "El cliente", prompt: "Smiling customer receiving a paper bag of warm bread at the counter" },
  { momento: "La mesa", prompt: "Family breakfast table with sliced bread, coffee and jam in soft morning light" },
];
const json = (fotos: unknown[], titulo = "Un día en la panadería") => JSON.stringify({ titulo, fotos });

// ---------- Estilos ----------

test("ESTILOS_FOTO: los cuatro estilos con su nombre en español y un sufijo en inglés", () => {
  assert.deepEqual(ESTILOS_FOTO.map((e) => e.id), ["realista", "estudio", "calido", "colorido"]);
  assert.deepEqual(ESTILOS_FOTO.map((e) => e.nombre), ["Realista", "De estudio", "Cálido", "Colorido"]);
  for (const e of ESTILOS_FOTO) {
    assert.ok(e.sufijo.length > 10, e.id);
    assert.match(e.sufijo, /^[\x20-\x7e]+$/, `${e.id}: el sufijo va en inglés, sin acentos`);
  }
  assert.equal(MIN_FOTOS, 3);
  assert.equal(MAX_FOTOS, 8);
  assert.deepEqual([...DURACIONES_SECUENCIA], [10, 15, 20, 30]);
});

// ---------- Prompt de la secuencia ----------

test("promptSecuencia: pide exactamente n fotos distintas, en orden, con la forma JSON y el tema", () => {
  const p = promptSecuencia({ tema: "Un día en mi panadería", n: 5, estilo: "calido", english: false });
  assert.match(p, /Un día en mi panadería/);
  assert.match(p, /exactamente 5/i);
  assert.match(p, /"titulo"/);
  assert.match(p, /"fotos"/);
  assert.match(p, /"momento"/);
  assert.match(p, /"prompt"/);
  assert.match(p, /orden cronológico/i);
  assert.match(p, /distint/i);
  assert.match(p, /60 palabras/);
  assert.match(p, /sin texto/i);
  assert.match(p, /nombres de personas reales/i);
  assert.match(p, /JSON/);
});

test("promptSecuencia: usa la marca si viene y pide los momentos en inglés con english", () => {
  const p = promptSecuencia({ tema: "Promo", n: 3, estilo: "realista", marca: "Tortas Tortuga, comida mexicana", english: true });
  assert.match(p, /exactamente 3/i);
  assert.match(p, /Tortas Tortuga, comida mexicana/);
  assert.match(p, /English/);
  const sinMarca = promptSecuencia({ tema: "Promo", n: 3, estilo: "realista", english: false });
  assert.doesNotMatch(sinMarca, /Contexto de la marca/);
});

// ---------- Lectura de la respuesta ----------

test("leerSecuencia: lee el JSON aunque venga con ```json y texto alrededor, y agrega el sufijo del estilo", () => {
  const r = leerSecuencia("Claro, aquí está:\n```json\n" + json(IDEAS) + "\n```\n¡Listo!", 5, "calido");
  assert.equal(r.titulo, "Un día en la panadería");
  assert.equal(r.fotos.length, 5);
  assert.deepEqual(r.fotos.map((f) => f.momento), IDEAS.map((i) => i.momento));
  for (const [i, f] of r.fotos.entries()) {
    assert.ok(f.prompt.startsWith(IDEAS[i].prompt), f.prompt);
    assert.ok(f.prompt.endsWith(sufijo("calido")), f.prompt);
  }
});

test("leerSecuencia: si sobran ideas, se queda con las primeras n", () => {
  const r = leerSecuencia(json(IDEAS), 3, "realista");
  assert.deepEqual(r.fotos.map((f) => f.momento), ["La masa", "Al horno", "En la vitrina"]);
});

test("leerSecuencia: quita repetidas (mismo momento o prompt casi igual) y usa las que siguen", () => {
  const conRepetidas = [
    IDEAS[0],
    { momento: "la masa ", prompt: "A baker pouring flour into a big bowl" }, // mismo momento
    IDEAS[1],
    { momento: "Otra vez al horno", prompt: "Golden bread loaves baking inside a glowing brick oven." }, // mismo prompt
    { momento: "Horno de nuevo", prompt: "Golden bread loaves baking inside the glowing brick oven" }, // casi igual
    IDEAS[2],
    IDEAS[3],
  ];
  const r = leerSecuencia(json(conRepetidas), 4, "estudio");
  assert.deepEqual(r.fotos.map((f) => f.momento), ["La masa", "Al horno", "En la vitrina", "El cliente"]);
  assert.equal(new Set(r.fotos.map((f) => f.prompt)).size, 4);
});

test("leerSecuencia: con menos de 3 ideas útiles, o sin JSON, falla con un error claro en español", () => {
  const error = { message: "La IA no pudo armar la secuencia. Intenta de nuevo." };
  assert.throws(() => leerSecuencia(json([IDEAS[0], IDEAS[1]]), 5, "realista"), error);
  assert.throws(() => leerSecuencia(json([IDEAS[0], IDEAS[0], IDEAS[0], IDEAS[1]]), 5, "realista"), error);
  assert.throws(() => leerSecuencia("No puedo ayudarte con eso.", 5, "realista"), error);
  assert.throws(() => leerSecuencia("{ fotos: [roto", 5, "realista"), error);
  assert.throws(() => leerSecuencia(JSON.stringify({ fotos: "nada" }), 5, "realista"), error);
  assert.throws(
    () => leerSecuencia(json([{ momento: "", prompt: "x y z" }, { momento: "A" }, { prompt: "solo prompt" }, IDEAS[0], IDEAS[1]]), 5, "realista"),
    error,
  );
});

test("leerSecuencia: con menos de n pero al menos 3, devuelve las que hay; recorta textos largos", () => {
  const largo = Array.from({ length: 90 }, (_, i) => `word${i}`).join(" ");
  const r = leerSecuencia(json([IDEAS[0], IDEAS[1], { momento: "M".repeat(200), prompt: largo }]), 6, "colorido");
  assert.equal(r.fotos.length, 3);
  assert.ok(r.fotos[2].momento.length <= 80);
  const palabras = r.fotos[2].prompt.replace(sufijo("colorido"), "").trim().replace(/,$/, "").split(/\s+/);
  assert.ok(palabras.length <= 60, String(palabras.length));
});

test("leerSecuencia: acepta la lista sola y un estilo desconocido usa el realista", () => {
  const r = leerSecuencia(JSON.stringify(IDEAS.slice(0, 3)), 3, "otro");
  assert.equal(r.titulo, "");
  assert.equal(r.fotos.length, 3);
  assert.ok(r.fotos[0].prompt.endsWith(sufijo("realista")));
});

// ---------- Guion ----------

test("palabrasGuion: unas 2.4 palabras por segundo", () => {
  assert.equal(palabrasGuion(10), 24);
  assert.equal(palabrasGuion(15), 36);
  assert.equal(palabrasGuion(20), 48);
  assert.equal(palabrasGuion(30), 72);
});

test("promptGuion: NOVA escribe la voz en off siguiendo los momentos en orden, con el largo y la llamada a la acción", () => {
  const p = promptGuion({ tema: "Un día en mi panadería", momentos: ["La masa", "Al horno", "El cliente"], segundos: 15, marca: "Panadería Sol", english: false });
  assert.ok(p.includes(PERSONA_NOVA));
  assert.match(p, /Un día en mi panadería/);
  assert.match(p, /1\. La masa\n2\. Al horno\n3\. El cliente/);
  assert.match(p, /36 palabras/);
  assert.match(p, /15 segundos/);
  assert.match(p, /en orden/i);
  assert.match(p, /llamada a la acción/i);
  assert.match(p, /emojis/i);
  assert.match(p, /hashtags/i);
  assert.match(p, /Panadería Sol/);
  assert.doesNotMatch(p, /English/);
  assert.match(promptGuion({ tema: "x", momentos: ["a"], segundos: 10, english: true }), /English/);
});

test("limpiarGuion: quita comillas, Markdown, etiquetas e indicaciones de escena", () => {
  assert.equal(limpiarGuion('Voz en off: "Todo empieza con la masa."'), "Todo empieza con la masa.");
  assert.equal(limpiarGuion("**Guion:**\n\n«Todo empieza con la masa. ¡Ven hoy!»"), "Todo empieza con la masa. ¡Ven hoy!");
  assert.equal(limpiarGuion("```\nVoiceover: Fresh bread, every day.\n```"), "Fresh bread, every day.");
  assert.equal(limpiarGuion("[Música suave] Todo empieza aquí. (pausa) Ven hoy. #pan 🍞"), "Todo empieza aquí. Ven hoy.");
  assert.equal(limpiarGuion("# Título\nPrimera frase.\nSegunda frase."), "Título Primera frase. Segunda frase.");
  assert.equal(limpiarGuion("   "), "");
});
