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
  MARGEN_RELOJ_STRIPE,
  mezclarConfig,
  pasarATarjetaDisponible,
  puedeUsar,
  costoTomaCentavos,
  modeloDePlan,
  normalizarMovimiento,
  prioridadToma,
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
  assert.equal(puedeUsar(DEFAULT_CONFIG, "prueba", "video_ia"), true);
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
  assert.deepEqual(DEFAULT_CONFIG.limitesMes.pro, { textos: 3000, imagenes: 1000, voces: 250, subtitulos: 250, tomas_ia: 20 });
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

test("pasarATarjetaDisponible: 48 h + 10 min → sí; 48 h + 9 min, 48 h o 47 h → no", () => {
  const MINUTO = 60 * 1000;
  assert.equal(MARGEN_RELOJ_STRIPE, 10 * MINUTO);
  assert.equal(pasarATarjetaDisponible(aMano({ pagadoHasta: AHORA + 48 * HORA + 10 * MINUTO }), AHORA), true);
  assert.equal(pasarATarjetaDisponible(aMano({ pagadoHasta: AHORA + 48 * HORA + 9 * MINUTO }), AHORA), false);
  assert.equal(pasarATarjetaDisponible(aMano({ pagadoHasta: AHORA + 48 * HORA }), AHORA), false);
  assert.equal(pasarATarjetaDisponible(aMano({ pagadoHasta: AHORA + 47 * HORA }), AHORA), false);
});

/* ---------- El pago a mano cubre hasta su fecha aunque ya pase a tarjeta ---------- */

const yaConTarjeta = (stripe: Negocio["stripe"], extra: Partial<Negocio> = {}) =>
  negocio({ estado: "activo", origen: "stripe", plan: "basico", pagadoHasta: AHORA + 10 * DIA, stripe, ...extra });

test("estadoEfectivo: stripe sin status todavía (recién pagó) + pago a mano vigente → activo", () => {
  assert.deepEqual(estadoEfectivo(yaConTarjeta({ customerId: "cus_1" }), AHORA), { estado: "activo", plan: "basico" });
});

test("estadoEfectivo: stripe canceled (canceló la prueba) + pago a mano vigente → activo", () => {
  assert.deepEqual(estadoEfectivo(yaConTarjeta({ status: "canceled" }), AHORA), { estado: "activo", plan: "basico" });
});

test("estadoEfectivo: stripe canceled + pago a mano vencido → pausado", () => {
  const n = yaConTarjeta({ status: "canceled" }, { pagadoHasta: AHORA - DIA });
  assert.deepEqual(estadoEfectivo(n, AHORA), { estado: "pausado", plan: "basico" });
});

test("estadoEfectivo: pausado por el administrador manda aunque el pago a mano siga vigente", () => {
  const n = yaConTarjeta({ status: "canceled" }, { estado: "pausado" });
  assert.deepEqual(estadoEfectivo(n, AHORA), { estado: "pausado", plan: "basico" });
});

test("estadoEfectivo: suscripción del otro modo sigue sin plan aunque haya pago a mano vigente", () => {
  const n = yaConTarjeta({ status: "active", livemode: false });
  assert.deepEqual(estadoEfectivo(n, AHORA, { stripeLive: true }), { estado: "sin_plan", plan: null });
});

test("pasarATarjetaDisponible: ya paga con tarjeta (suscripción viva) → no", () => {
  for (const status of ["active", "trialing", "past_due", "unpaid", "paused"]) {
    assert.equal(pasarATarjetaDisponible(aMano({ origen: "stripe", stripe: { status } }), AHORA), false, status);
  }
});

test("pasarATarjetaDisponible: tarjeta sin suscripción viva (canceló) y efectivo vigente → sí", () => {
  assert.equal(pasarATarjetaDisponible(aMano({ origen: "stripe", stripe: { status: "canceled" } }), AHORA), true);
  assert.equal(pasarATarjetaDisponible(aMano({ origen: "stripe", stripe: { status: "canceled" }, pagadoHasta: AHORA - 1 }), AHORA), false);
});

test("pasarATarjetaDisponible: pausado → no", () => {
  assert.equal(pasarATarjetaDisponible(aMano({ estado: "pausado" }), AHORA), false);
});

test("pasarATarjetaDisponible: sin fecha de pago → no", () => {
  assert.equal(pasarATarjetaDisponible(aMano({ pagadoHasta: undefined }), AHORA), false);
});

// ── Video híbrido: tomas con IA ──────────────────────────────────────────────

test("tomas con IA: valores por defecto del contador, el paquete y la herramienta", () => {
  assert.equal(limiteMes(DEFAULT_CONFIG, "prueba", "tomas_ia"), 1);
  assert.equal(limiteMes(DEFAULT_CONFIG, "basico", "tomas_ia"), 0);
  assert.equal(limiteMes(DEFAULT_CONFIG, "pro", "tomas_ia"), 20);
  assert.deepEqual(DEFAULT_CONFIG.paquetes.video, { monto: 15, contenido: { tomas_ia: 20 }, planes: ["basico", "pro"] });
  for (const plan of ["prueba", "basico", "pro"] as const) assert.equal(puedeUsar(DEFAULT_CONFIG, plan, "video_ia"), true);
  assert.equal(esPaquete("video"), true);
});

test("tomas con IA: configuración de video por defecto", () => {
  assert.deepEqual(DEFAULT_CONFIG.videoIa, {
    modelos: {
      demo: { id: "minimax/h3-max-turbo/image-to-video", centavosPorSegundo: 2.5, resolucion: "480P" },
      estandar: { id: "minimax/h3-max-turbo/image-to-video", centavosPorSegundo: 4, resolucion: "768P" },
    },
    segundosToma: 5,
    topeDiarioCentavos: 3000,
    tomasPorNegocioDia: 20,
    umbralDemo: 0.8,
    simultaneos: 3,
    minutosAtorado: 15,
    maxIntentos: 2,
  });
});

test("mezclarConfig mezcla videoIa sin perder los valores por defecto", () => {
  const cfg = mezclarConfig({
    videoIa: { topeDiarioCentavos: 800, modelos: { demo: { id: "fal-ai/otro" } } },
  } as unknown as Parameters<typeof mezclarConfig>[0]);
  assert.equal(cfg.videoIa.topeDiarioCentavos, 800);
  assert.equal(cfg.videoIa.simultaneos, 3);
  assert.deepEqual(cfg.videoIa.modelos.demo, { id: "fal-ai/otro", centavosPorSegundo: 2.5, resolucion: "480P" });
  assert.deepEqual(cfg.videoIa.modelos.estandar, DEFAULT_CONFIG.videoIa.modelos.estandar);
  assert.equal(DEFAULT_CONFIG.videoIa.topeDiarioCentavos, 3000);
  assert.equal(cfg.paquetes.video.monto, 15);
  assert.equal(mezclarConfig({ limitesMes: { pro: { textos: 5 } } } as never).limitesMes.pro.tomas_ia, 20);
});

test("tomas con IA: costo, modelo y prioridad", () => {
  assert.equal(costoTomaCentavos(DEFAULT_CONFIG, "estandar"), 20);
  assert.equal(costoTomaCentavos(DEFAULT_CONFIG, "demo"), 13);
  assert.equal(modeloDePlan("prueba"), "demo");
  assert.equal(modeloDePlan("basico"), "estandar");
  assert.equal(modeloDePlan("pro"), "estandar");
  assert.equal(prioridadToma("pro", false), 1);
  assert.equal(prioridadToma("pro", true), 2);
  assert.equal(prioridadToma("basico", true), 2);
  assert.equal(prioridadToma("prueba", false), 3);
});

test("normalizarMovimiento: minúsculas, espacios simples y máximo 300", () => {
  assert.equal(normalizarMovimiento("  Zoom   Lento "), "zoom lento");
  assert.equal(normalizarMovimiento("a\n\tB"), "a b");
  assert.equal(normalizarMovimiento("x".repeat(400)).length, 300);
});
