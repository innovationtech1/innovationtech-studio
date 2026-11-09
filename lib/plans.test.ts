import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  diaChicago,
  estadoEfectivo,
  limiteMes,
  mesChicago,
  inicioMesSiguienteChicago,
  repartirReserva,
  sumarSaldo,
  cantidadSegura,
  esPaquete,
  mezclarConfig,
  pasarATarjetaDisponible,
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

test("limiteMes: contadores por plan", () => {
  assert.equal(limiteMes(DEFAULT_CONFIG, "basico", "imagenes"), 300);
  assert.equal(limiteMes(DEFAULT_CONFIG, "pro", "subtitulos"), 250);
  assert.equal(limiteMes(DEFAULT_CONFIG, "prueba", "textos"), 10);
  assert.equal(limiteMes(DEFAULT_CONFIG, "basico", "voces"), 0);
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

test("mesChicago: 30 nov 7pm Chicago (1 dic UTC) sigue en noviembre", () => {
  assert.equal(mesChicago(Date.parse("2026-12-01T01:00:00Z")), "2026-11");
  assert.equal(mesChicago(Date.parse("2026-12-01T06:00:00Z")), "2026-12");
});
test("mesChicago: en horario de verano (31 oct 11:59pm CDT)", () => {
  assert.equal(mesChicago(Date.parse("2026-11-01T04:59:00Z")), "2026-10");
  assert.equal(mesChicago(Date.parse("2026-11-01T05:00:00Z")), "2026-11");
});
test("inicioMesSiguienteChicago: 8 nov → 1 dic 00:00 CST", () => {
  assert.equal(inicioMesSiguienteChicago(Date.parse("2026-11-08T18:00:00Z")), Date.parse("2026-12-01T06:00:00Z"));
});
test("inicioMesSiguienteChicago: diciembre pasa a enero y octubre a noviembre (horario de verano)", () => {
  assert.equal(inicioMesSiguienteChicago(Date.parse("2026-12-15T12:00:00Z")), Date.parse("2027-01-01T06:00:00Z"));
  assert.equal(inicioMesSiguienteChicago(Date.parse("2026-10-15T12:00:00Z")), Date.parse("2026-11-01T05:00:00Z"));
});
test("repartirReserva", () => {
  assert.deepEqual(repartirReserva(0, 10, 0, 1), { delMes: 1, delSaldo: 0 });
  assert.deepEqual(repartirReserva(9, 10, 5, 3), { delMes: 1, delSaldo: 2 });
  assert.deepEqual(repartirReserva(10, 10, 5, 2), { delMes: 0, delSaldo: 2 });
  assert.equal(repartirReserva(10, 10, 1, 2), null);
  assert.equal(repartirReserva(12, 10, 0, 1), null); // tope bajado por el admin
});
test("sumarSaldo nunca baja de 0", () => {
  assert.deepEqual(sumarSaldo({ voces: 3 }, { voces: 10 }, -1), {});
  assert.deepEqual(sumarSaldo(undefined, { textos: 500, imagenes: 150 }, 1), { textos: 500, imagenes: 150 });
});
test("sumarSaldo: lo guardado como texto o vacío se lee como número seguro (nunca NaN)", () => {
  assert.deepEqual(sumarSaldo({ voces: "100" } as never, { voces: 1 }, -1), { voces: 99 });
  assert.deepEqual(sumarSaldo({ textos: 5 }, { textos: undefined } as never, 1), { textos: 5 });
  assert.deepEqual(sumarSaldo({ textos: Number.NaN, imagenes: -3 } as never, { textos: 2, imagenes: 1 }, 1), { textos: 2, imagenes: 1 });
});
test("cantidadSegura", () => {
  assert.equal(cantidadSegura(7), 7);
  assert.equal(cantidadSegura("100"), 100);
  assert.equal(cantidadSegura(2.7), 2);
  for (const x of [undefined, null, "", "abc", -1, Number.NaN, Infinity, {}]) assert.equal(cantidadSegura(x), 0);
});
test("esPaquete", () => {
  assert.equal(esPaquete("creativo"), true);
  assert.equal(esPaquete("voz"), true);
  assert.equal(esPaquete("otro"), false);
  assert.equal(esPaquete(undefined), false);
});
test("DEFAULT_CONFIG: topes mensuales y paquetes", () => {
  assert.deepEqual(DEFAULT_CONFIG.limitesMes.pro, { textos: 3000, imagenes: 1000, voces: 250, subtitulos: 250 });
  assert.deepEqual(DEFAULT_CONFIG.paquetes.creativo.contenido, { textos: 500, imagenes: 150 });
  assert.equal(DEFAULT_CONFIG.paquetes.creativo.monto, 5);
  assert.deepEqual(DEFAULT_CONFIG.paquetes.creativo.planes, ["basico", "pro"]);
  assert.deepEqual(DEFAULT_CONFIG.paquetes.voz.contenido, { voces: 100, subtitulos: 100 });
});
test("mezclarConfig ignora los límites diarios viejos", () => {
  const cfg = mezclarConfig({ limites: { basico: { textos: 60 } } } as never);
  assert.equal(cfg.limitesMes.basico.textos, 1000);
  assert.equal(cfg.paquetes.voz.monto, 9);
  assert.deepEqual(cfg.paquetes.voz.planes, ["pro"]);
});

/* ---------- Pasar de pago a mano a tarjeta ---------- */

const HORA = 60 * 60 * 1000;
const aMano = (extra: Partial<Negocio> = {}) =>
  negocio({ estado: "activo", origen: "manual", plan: "basico", pagadoHasta: AHORA + 49 * HORA, ...extra });

test("pasarATarjetaDisponible: pago a mano que vence en 49 h → sí", () => {
  assert.equal(pasarATarjetaDisponible(aMano(), AHORA), true);
});

test("pasarATarjetaDisponible: justo 48 h → sí; 47 h → no", () => {
  assert.equal(pasarATarjetaDisponible(aMano({ pagadoHasta: AHORA + 48 * HORA }), AHORA), true);
  assert.equal(pasarATarjetaDisponible(aMano({ pagadoHasta: AHORA + 47 * HORA }), AHORA), false);
});

test("pasarATarjetaDisponible: ya paga con tarjeta → no", () => {
  assert.equal(pasarATarjetaDisponible(aMano({ origen: "stripe" }), AHORA), false);
});

test("pasarATarjetaDisponible: pausado → no", () => {
  assert.equal(pasarATarjetaDisponible(aMano({ estado: "pausado" }), AHORA), false);
});

test("pasarATarjetaDisponible: sin fecha de pago → no", () => {
  assert.equal(pasarATarjetaDisponible(aMano({ pagadoHasta: undefined }), AHORA), false);
});
