import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  diaChicago,
  estadoEfectivo,
  limite,
  puedeUsar,
  type Negocio,
} from "./plans";

const AHORA = Date.parse("2026-11-07T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;

function negocio(extra: Partial<Negocio>): Negocio {
  return {
    id: "n1",
    nombre: "Negocio de prueba",
    duenoUid: "u1",
    miembros: ["u1"],
    plan: null,
    estado: "prueba",
    origen: null,
    creado: AHORA - 5 * DIA,
    actualizado: AHORA - 5 * DIA,
    ...extra,
  };
}

test("estadoEfectivo: prueba vigente", () => {
  const n = negocio({ estado: "prueba", pruebaHasta: AHORA + DIA });
  assert.deepEqual(estadoEfectivo(n, AHORA), { estado: "prueba", plan: "prueba" });
});

test("estadoEfectivo: prueba vencida queda sin plan", () => {
  const n = negocio({ estado: "prueba", pruebaHasta: AHORA - 1 });
  assert.deepEqual(estadoEfectivo(n, AHORA), { estado: "sin_plan", plan: null });
});

test("estadoEfectivo: pausado manda aunque Stripe diga active", () => {
  const n = negocio({
    estado: "pausado",
    plan: "pro",
    origen: "stripe",
    stripe: { status: "active" },
  });
  assert.deepEqual(estadoEfectivo(n, AHORA), { estado: "pausado", plan: "pro" });
});

test("estadoEfectivo: manual con pago vigente", () => {
  const n = negocio({
    estado: "activo",
    plan: "basico",
    origen: "manual",
    pagadoHasta: AHORA + DIA,
  });
  assert.deepEqual(estadoEfectivo(n, AHORA), { estado: "activo", plan: "basico" });
});

test("estadoEfectivo: manual vencido se pausa", () => {
  const n = negocio({
    estado: "activo",
    plan: "basico",
    origen: "manual",
    pagadoHasta: AHORA - 1,
  });
  assert.deepEqual(estadoEfectivo(n, AHORA), { estado: "pausado", plan: "basico" });
});

for (const status of ["active", "trialing"]) {
  test(`estadoEfectivo: stripe ${status} es activo`, () => {
    const n = negocio({
      estado: "activo",
      plan: "pro",
      origen: "stripe",
      stripe: { status },
    });
    assert.deepEqual(estadoEfectivo(n, AHORA), { estado: "activo", plan: "pro" });
  });
}

for (const status of ["past_due", "unpaid", "canceled", "incomplete"]) {
  test(`estadoEfectivo: stripe ${status} es pausado`, () => {
    const n = negocio({
      estado: "activo",
      plan: "pro",
      origen: "stripe",
      stripe: { status },
    });
    assert.deepEqual(estadoEfectivo(n, AHORA), { estado: "pausado", plan: "pro" });
  });
}

test("puedeUsar: herramientas por plan", () => {
  assert.equal(puedeUsar(DEFAULT_CONFIG, "basico", "reels"), false);
  assert.equal(puedeUsar(DEFAULT_CONFIG, "pro", "reels"), true);
  assert.equal(puedeUsar(DEFAULT_CONFIG, "prueba", "voz"), true);
  assert.equal(puedeUsar(DEFAULT_CONFIG, "prueba", "video_ia"), false);
  assert.equal(puedeUsar(DEFAULT_CONFIG, "basico", "musica"), true);
});

test("limite: contadores por plan", () => {
  assert.equal(limite(DEFAULT_CONFIG, "basico", "imagenes"), 20);
  assert.equal(limite(DEFAULT_CONFIG, "pro", "subtitulos"), 30);
  assert.equal(limite(DEFAULT_CONFIG, "prueba", "textos"), 10);
  assert.equal(limite(DEFAULT_CONFIG, "basico", "voces"), 0);
});

test("diaChicago: cambio de día y de horario", () => {
  assert.equal(diaChicago(Date.parse("2026-11-07T05:59:00Z")), "2026-11-06");
  assert.equal(diaChicago(Date.parse("2026-11-07T06:01:00Z")), "2026-11-07");
  assert.equal(diaChicago(Date.parse("2026-11-01T04:59:00Z")), "2026-10-31");
  assert.equal(diaChicago(Date.parse("2026-11-02T05:30:00Z")), "2026-11-01");
});

/* ---------- Modo de Stripe (prueba / real) ---------- */

const conTarjeta = (livemode?: boolean) =>
  negocio({ estado: "activo", plan: "pro", origen: "stripe", stripe: { status: "active", ...(livemode === undefined ? {} : { livemode }) } });

test("estadoEfectivo sin opciones: no mira el modo de Stripe (como antes)", () => {
  assert.deepEqual(estadoEfectivo(conTarjeta(false), AHORA), { estado: "activo", plan: "pro" });
  assert.deepEqual(estadoEfectivo(conTarjeta(true), AHORA), { estado: "activo", plan: "pro" });
});

test("estadoEfectivo: con claves reales, una suscripción de prueba no da plan", () => {
  assert.deepEqual(estadoEfectivo(conTarjeta(false), AHORA, { stripeLive: true }), { estado: "sin_plan", plan: null });
  assert.deepEqual(estadoEfectivo(conTarjeta(true), AHORA, { stripeLive: true }), { estado: "activo", plan: "pro" });
});

test("estadoEfectivo: con claves de prueba, una suscripción real no da plan", () => {
  assert.deepEqual(estadoEfectivo(conTarjeta(true), AHORA, { stripeLive: false }), { estado: "sin_plan", plan: null });
  assert.deepEqual(estadoEfectivo(conTarjeta(false), AHORA, { stripeLive: false }), { estado: "activo", plan: "pro" });
});

test("estadoEfectivo: sin modo guardado (datos viejos) se queda como antes", () => {
  assert.deepEqual(estadoEfectivo(conTarjeta(), AHORA, { stripeLive: true }), { estado: "activo", plan: "pro" });
});

test("estadoEfectivo: el modo solo importa si el origen es Stripe", () => {
  const n = negocio({ estado: "activo", plan: "basico", origen: "manual", pagadoHasta: AHORA + DIA, stripe: { status: "canceled", livemode: false } });
  assert.deepEqual(estadoEfectivo(n, AHORA, { stripeLive: true }), { estado: "activo", plan: "basico" });
});
