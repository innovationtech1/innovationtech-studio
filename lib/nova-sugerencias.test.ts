import { test } from "node:test";
import assert from "node:assert/strict";
import type { CuentaNova } from "./nova";
import {
  INACTIVO_MS,
  ENTRE_SUGERENCIAS_MS,
  SUGERENCIAS,
  debeSugerir,
  ideasDeImagen,
  sinIdeasDeImagen,
  siguienteSugerencia,
  type Sugerencia,
} from "./nova-sugerencias";

// Fechas fijas en hora de Chicago (mediodía, para no caer en otro día por la zona horaria)
const MARTES = new Date(Date.UTC(2026, 10, 17, 18)); // martes 17 nov 2026
const SABADO = new Date(Date.UTC(2026, 10, 21, 18)); // sábado 21 nov 2026

const cuenta = (extra: Partial<CuentaNova> = {}): CuentaNova => ({
  plan: "pro",
  estado: "activo",
  limites: { textos: 3000, imagenes: 1000, tomas_ia: 20 },
  uso: { textos: 100, imagenes: 10, tomas_ia: 5 },
  saldo: {},
  ...extra,
});
const ids = (l: Sugerencia[]) => l.map((s) => s.id);

test("SUGERENCIAS: entre 8 y 12, con id, texto y mensaje, sin ids repetidos", () => {
  for (const c of [null, cuenta(), cuenta({ uso: { textos: 2990, tomas_ia: 0 } })]) {
    for (const dia of [MARTES, SABADO]) {
      const l = SUGERENCIAS(c, "Tortas Tortuga", dia);
      assert.ok(l.length >= 8 && l.length <= 12, `largo ${l.length}`);
      assert.equal(new Set(ids(l)).size, l.length);
      for (const s of l) assert.ok(s.id && s.texto && s.mensaje);
    }
  }
});

test("SUGERENCIAS: con tomas de video con IA disponibles propone un reel con IA", () => {
  assert.ok(ids(SUGERENCIAS(cuenta(), "", MARTES)).includes("reel-ia"));
  // las tomas del mes se acabaron, pero hay saldo de paquete
  assert.ok(ids(SUGERENCIAS(cuenta({ uso: { tomas_ia: 20 }, saldo: { tomas_ia: 4 } }), "", MARTES)).includes("reel-ia"));
  assert.ok(!ids(SUGERENCIAS(cuenta({ uso: { tomas_ia: 20 } }), "", MARTES)).includes("reel-ia"));
  assert.ok(!ids(SUGERENCIAS(cuenta({ limites: { textos: 3000 } }), "", MARTES)).includes("reel-ia"));
});

test("SUGERENCIAS: en fin de semana propone un post de fin de semana", () => {
  assert.ok(ids(SUGERENCIAS(cuenta(), "", SABADO)).includes("fin-de-semana"));
  assert.ok(!ids(SUGERENCIAS(cuenta(), "", MARTES)).includes("fin-de-semana"));
  assert.ok(ids(SUGERENCIAS(null, "", SABADO)).includes("fin-de-semana"));
});

test("SUGERENCIAS: con pocos textos le dice que los aproveche", () => {
  const pocos = SUGERENCIAS(cuenta({ uso: { textos: 2990, tomas_ia: 5 } }), "", MARTES);
  const s = pocos.find((x) => x.id === "textos-pocos");
  assert.ok(s);
  assert.match(s.texto, /aprovecha/i);
  assert.match(s.texto, /10/);
  assert.ok(!ids(SUGERENCIAS(cuenta(), "", MARTES)).includes("textos-pocos"));
  // sin textos del todo no tiene nada que aprovechar
  assert.ok(!ids(SUGERENCIAS(cuenta({ uso: { textos: 3000 } }), "", MARTES)).includes("textos-pocos"));
});

test("SUGERENCIAS: sin datos del plan solo da ideas generales", () => {
  const l = ids(SUGERENCIAS(null, "", MARTES));
  assert.ok(!l.includes("reel-ia"));
  assert.ok(!l.includes("textos-pocos"));
  assert.ok(l.length >= 8);
});

test("SUGERENCIAS: usa el nombre del negocio, o «mi negocio» sin nombre", () => {
  assert.ok(SUGERENCIAS(null, "Tortas Tortuga", MARTES).some((s) => s.mensaje.includes("Tortas Tortuga")));
  const sin = SUGERENCIAS(null, "   ", MARTES);
  assert.ok(sin.some((s) => s.mensaje.includes("mi negocio")));
});

const L: Sugerencia[] = [
  { id: "a", texto: "A", mensaje: "a" },
  { id: "b", texto: "B", mensaje: "b" },
  { id: "c", texto: "C", mensaje: "c" },
];

test("siguienteSugerencia: la primera que no se ha visto", () => {
  assert.equal(siguienteSugerencia(L, [])?.id, "a");
  assert.equal(siguienteSugerencia(L, ["a"])?.id, "b");
  assert.equal(siguienteSugerencia(L, ["a", "c"])?.id, "b");
});

test("siguienteSugerencia: cuando ya vio todas, vuelve a empezar; lista vacía → null", () => {
  assert.equal(siguienteSugerencia(L, ["a", "b", "c"])?.id, "a");
  assert.equal(siguienteSugerencia([], ["a"]), null);
});

const LISTO = { inactivoMs: 45_000, desdeUltimaMs: 180_000, escribiendo: false, transmitiendo: false, visible: true, textoEnCaja: false };

test("debeSugerir: sí con 45 s inactivo y 3 min desde la última", () => {
  assert.equal(INACTIVO_MS, 45_000);
  assert.equal(ENTRE_SUGERENCIAS_MS, 180_000);
  assert.equal(debeSugerir(LISTO), true);
  assert.equal(debeSugerir({ ...LISTO, inactivoMs: 90_000, desdeUltimaMs: 1e9 }), true);
});

test("debeSugerir: no antes de los tiempos", () => {
  assert.equal(debeSugerir({ ...LISTO, inactivoMs: 44_999 }), false);
  assert.equal(debeSugerir({ ...LISTO, desdeUltimaMs: 179_999 }), false);
});

test("debeSugerir: cada bloqueo la impide", () => {
  assert.equal(debeSugerir({ ...LISTO, escribiendo: true }), false);
  assert.equal(debeSugerir({ ...LISTO, transmitiendo: true }), false);
  assert.equal(debeSugerir({ ...LISTO, visible: false }), false);
  assert.equal(debeSugerir({ ...LISTO, textoEnCaja: true }), false);
});

test("ideasDeImagen: todas las líneas PROMPT DE IMAGEN, máximo 3", () => {
  const t = [
    "Aquí tu post.",
    "PROMPT DE IMAGEN: a torta on a table",
    "**PROMPT DE IMAGEN:** neon sign, night",
    "prompt de imagen: chef smiling",
    "PROMPT DE IMAGEN: a fourth one",
  ].join("\n");
  assert.deepEqual(ideasDeImagen(t), ["a torta on a table", "neon sign, night", "chef smiling"]);
  assert.deepEqual(ideasDeImagen("Sin imágenes"), []);
  assert.deepEqual(ideasDeImagen("PROMPT DE IMAGEN:   \nOtro"), []);
});

test("sinIdeasDeImagen: quita todas las líneas de ideas de imagen", () => {
  assert.equal(sinIdeasDeImagen("Post\n\nPROMPT DE IMAGEN: a\n**PROMPT DE IMAGEN:** b\nFin"), "Post\n\nFin");
});
