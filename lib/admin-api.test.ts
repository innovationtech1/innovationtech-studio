import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { activarManual, finDelDiaChicago, listar, obtenerNegocio, pausar, reactivar } from "./admin-api";
import type { Usuario } from "./account-store";
import { memoryStore } from "./account-store-memory";
import { diaChicago, estadoEfectivo, type Negocio } from "./plans";

const AHORA = Date.parse("2026-11-07T18:00:00Z");
const DIA = 24 * 60 * 60 * 1000;
const ADMIN = "admin@ejemplo.com";

function negocio(extra: Partial<Negocio> = {}): Negocio {
  return {
    id: "n1",
    nombre: "Tortas",
    duenoUid: "u1",
    miembros: ["u1"],
    plan: null,
    estado: "prueba",
    origen: null,
    pruebaHasta: AHORA - DIA,
    creado: AHORA - 5 * DIA,
    actualizado: AHORA - 5 * DIA,
    ...extra,
  };
}
const dueno: Usuario = { uid: "u1", email: "dueno@ejemplo.com", negocioId: "n1", rol: "dueno", creado: AHORA };
const datos = (extra = {}) => ({
  plan: "pro" as const,
  hasta: AHORA + 30 * DIA,
  monto: 39,
  metodo: "cashapp" as const,
  ...extra,
});

const guardado = process.env.STUDIO_ADMIN_EMAILS;
beforeEach(() => {
  process.env.STUDIO_ADMIN_EMAILS = ADMIN;
});
afterEach(() => {
  if (guardado === undefined) delete process.env.STUDIO_ADMIN_EMAILS;
  else process.env.STUDIO_ADMIN_EMAILS = guardado;
});

const nuevo = (n: Partial<Negocio> = {}) => memoryStore({ negocios: [negocio(n)], usuarios: [dueno] });

test("un correo que no es admin recibe 403 en todo", async () => {
  const store = nuevo();
  const deps = { store, now: AHORA };
  for (const r of [
    await listar("otro@x.com", true, deps),
    await obtenerNegocio("otro@x.com", true, "n1", deps),
    await activarManual("otro@x.com", true, "n1", datos(), deps),
    await pausar("otro@x.com", true, "n1", deps),
    await reactivar("otro@x.com", true, "n1", deps),
  ]) {
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.status, 403);
      assert.equal(r.codigo, "NO_ADMIN");
    }
  }
  assert.equal((await store.getNegocio("n1"))?.estado, "prueba");
});

test("admin con correo sin confirmar: 403", async () => {
  const r = await listar(ADMIN, false, { store: nuevo(), now: AHORA });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
});

test("activarManual con cashapp deja el negocio activo y guarda el pago", async () => {
  const store = nuevo();
  const r = await activarManual(ADMIN, true, "n1", datos({ nota: "Pagó en persona" }), { store, now: AHORA });
  assert.equal(r.ok, true);
  const n = (await store.getNegocio("n1"))!;
  assert.equal(n.plan, "pro");
  assert.equal(n.estado, "activo");
  assert.equal(n.origen, "manual");
  assert.equal(n.pagadoHasta, AHORA + 30 * DIA);
  assert.equal(n.actualizado, AHORA);
  assert.deepEqual(estadoEfectivo(n, AHORA), { estado: "activo", plan: "pro" });
  const pagos = await store.listarPagosManuales("n1");
  assert.equal(pagos.length, 1);
  assert.equal(pagos[0].metodo, "cashapp");
  assert.equal(pagos[0].monto, 39);
  assert.equal(pagos[0].registradoPor, ADMIN);
  assert.equal(pagos[0].nota, "Pagó en persona");
  assert.equal(pagos[0].fecha, AHORA);
});

test("al pasar la fecha pagada, el estado efectivo es pausado", async () => {
  const store = nuevo();
  await activarManual(ADMIN, true, "n1", datos(), { store, now: AHORA });
  const n = (await store.getNegocio("n1"))!;
  assert.equal(estadoEfectivo(n, AHORA + 31 * DIA).estado, "pausado");
});

test("activarManual: validaciones", async () => {
  const store = nuevo();
  const deps = { store, now: AHORA };
  const casos: Array<[Record<string, unknown>, string]> = [
    [{ plan: "premium" }, "Elige Básico o Pro."],
    [{ hasta: AHORA - 1 }, "La fecha de pago debe ser futura."],
    [{ hasta: AHORA }, "La fecha de pago debe ser futura."],
    [{ hasta: "mañana" }, "La fecha de pago debe ser futura."],
    [{ monto: -1 }, "Escribe un monto válido."],
    [{ monto: Number.NaN }, "Escribe un monto válido."],
    [{ monto: "39" }, "Escribe un monto válido."],
    [{ metodo: "bitcoin" }, "Elige la forma de pago."],
  ];
  for (const [extra, msg] of casos) {
    const r = await activarManual(ADMIN, true, "n1", datos(extra) as never, deps);
    assert.equal(r.ok, false, msg);
    if (!r.ok) {
      assert.equal(r.status, 400);
      assert.equal(r.error, msg);
    }
  }
  assert.equal((await store.listarPagosManuales("n1")).length, 0);
  const sin = await activarManual(ADMIN, true, "nada", datos(), deps);
  assert.ok(!sin.ok && sin.status === 404 && sin.error === "No encontramos ese negocio.");
});

test("monto 0 es válido (cortesía)", async () => {
  const r = await activarManual(ADMIN, true, "n1", datos({ monto: 0 }), { store: nuevo(), now: AHORA });
  assert.equal(r.ok, true);
});

test("activarManual sobre una suscripción de tarjeta que todavía puede cobrar: 400", async () => {
  // past_due, unpaid y paused también: Stripe puede volver a cobrar (sería un doble cobro)
  for (const status of ["active", "trialing", "past_due", "unpaid", "paused"]) {
    const store = nuevo({ plan: "pro", estado: "activo", origen: "stripe", stripe: { subscriptionId: "sub_1", status } });
    const r = await activarManual(ADMIN, true, "n1", datos(), { store, now: AHORA });
    assert.ok(!r.ok && r.status === 400, status);
    if (!r.ok) assert.equal(r.error, "Este negocio ya paga con tarjeta. Cancela su suscripción en Stripe antes de activarlo a mano.");
    assert.equal((await store.listarPagosManuales("n1")).length, 0);
  }
  // Aunque el origen ya sea manual, si la suscripción guardada sigue viva no se activa
  const manual = nuevo({ plan: "pro", estado: "activo", origen: "manual", pagadoHasta: AHORA + DIA, stripe: { subscriptionId: "sub_1", status: "past_due" } });
  assert.equal((await activarManual(ADMIN, true, "n1", datos(), { store: manual, now: AHORA })).ok, false);
});

test("activarManual con la suscripción cancelada (o del otro modo de Stripe): sí se puede", async () => {
  for (const status of ["canceled", "incomplete_expired"]) {
    const store = nuevo({ plan: "pro", estado: "pausado", origen: "stripe", stripe: { subscriptionId: "sub_1", status } });
    assert.equal((await activarManual(ADMIN, true, "n1", datos(), { store, now: AHORA })).ok, true, status);
  }
  // Una suscripción de prueba «activa» no cobra en modo real
  const prueba = nuevo({ plan: "pro", estado: "activo", origen: "stripe", stripe: { subscriptionId: "sub_1", status: "active", livemode: false } });
  assert.equal((await activarManual(ADMIN, true, "n1", datos(), { store: prueba, now: AHORA, stripeLive: true })).ok, true);
});

test("reactivar un negocio de Stripe con past_due: error", async () => {
  const store = nuevo({ plan: "pro", estado: "pausado", origen: "stripe", stripe: { status: "past_due" } });
  const r = await reactivar(ADMIN, true, "n1", { store, now: AHORA });
  assert.ok(!r.ok && r.status === 400 && r.error === "La suscripción de Stripe no está al día; no se puede reactivar.");
  assert.equal((await store.getNegocio("n1"))?.estado, "pausado");
});

test("reactivar un negocio de Stripe al día: activo", async () => {
  const store = nuevo({ plan: "pro", estado: "pausado", origen: "stripe", stripe: { status: "active" } });
  const r = await reactivar(ADMIN, true, "n1", { store, now: AHORA });
  assert.equal(r.ok, true);
  assert.equal((await store.getNegocio("n1"))?.estado, "activo");
});

test("pausar y reactivar un negocio manual aún pagado vuelve a activo", async () => {
  const store = nuevo();
  const deps = { store, now: AHORA };
  await activarManual(ADMIN, true, "n1", datos(), deps);
  assert.equal((await pausar(ADMIN, true, "n1", deps)).ok, true);
  const pausado = (await store.getNegocio("n1"))!;
  assert.equal(pausado.estado, "pausado");
  assert.equal(estadoEfectivo(pausado, AHORA).estado, "pausado");
  assert.equal((await reactivar(ADMIN, true, "n1", deps)).ok, true);
  assert.equal(estadoEfectivo((await store.getNegocio("n1"))!, AHORA).estado, "activo");
});

test("reactivar manual vencido, o en prueba: error", async () => {
  const vencido = nuevo({ plan: "basico", estado: "pausado", origen: "manual", pagadoHasta: AHORA - 1 });
  const r = await reactivar(ADMIN, true, "n1", { store: vencido, now: AHORA });
  assert.ok(!r.ok && r.status === 400 && r.error === "El pago a mano ya venció. Registra un pago nuevo con «Activar plan».");
  const prueba = nuevo();
  const r2 = await reactivar(ADMIN, true, "n1", { store: prueba, now: AHORA });
  assert.ok(!r2.ok && r2.status === 400 && r2.error === "Este negocio no tiene un plan pagado.");
});

test("pausar / reactivar un negocio que no existe: 404", async () => {
  const deps = { store: nuevo(), now: AHORA };
  for (const r of [await pausar(ADMIN, true, "zz", deps), await reactivar(ADMIN, true, "zz", deps)]) {
    assert.ok(!r.ok && r.status === 404);
  }
});

test("listar incluye correo del dueño, estado efectivo y uso de hoy", async () => {
  const store = memoryStore({
    negocios: [negocio({ id: "n1" }), negocio({ id: "n2", nombre: "Otro", duenoUid: "sinuser", creado: AHORA })],
    usuarios: [dueno],
    uso: { [`n1_${diaChicago(AHORA)}`]: { textos: 12, imagenes: 3 } },
  });
  const r = await listar(ADMIN, true, { store, now: AHORA });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.negocios.map((x) => x.negocio.id), ["n2", "n1"]); // más nuevo primero
  const n1 = r.negocios.find((x) => x.negocio.id === "n1")!;
  assert.equal(n1.dueno, "dueno@ejemplo.com");
  assert.equal(n1.efectivo.estado, "sin_plan");
  assert.deepEqual(n1.usoHoy, { textos: 12, imagenes: 3, voces: 0, subtitulos: 0 });
  assert.equal(r.negocios.find((x) => x.negocio.id === "n2")!.dueno, "");
});

test("obtenerNegocio devuelve negocio, efectivo y pagos", async () => {
  const store = nuevo();
  await activarManual(ADMIN, true, "n1", datos(), { store, now: AHORA });
  const r = await obtenerNegocio(ADMIN, true, "n1", { store, now: AHORA });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.efectivo.estado, "activo");
    assert.equal(r.pagos.length, 1);
  }
  const no = await obtenerNegocio(ADMIN, true, "zz", { store, now: AHORA });
  assert.ok(!no.ok && no.status === 404);
});

test("finDelDiaChicago: fin del día en hora de Chicago (invierno y verano)", () => {
  // Diciembre: CST (UTC-6) → 23:59:59 local = 05:59:59 UTC del día siguiente
  assert.equal(finDelDiaChicago("2026-12-07"), Date.parse("2026-12-08T05:59:59Z"));
  // Julio: CDT (UTC-5)
  assert.equal(finDelDiaChicago("2026-07-15"), Date.parse("2026-07-16T04:59:59Z"));
  // Día del cambio de hora (8 de marzo de 2026, a las 2:00 se salta a las 3:00): al terminar el día ya es CDT
  assert.equal(finDelDiaChicago("2026-03-08"), Date.parse("2026-03-09T04:59:59Z"));
  // Día en que se retrasa la hora (1 de noviembre de 2026): al terminar el día ya es CST
  assert.equal(finDelDiaChicago("2026-11-01"), Date.parse("2026-11-02T05:59:59Z"));
  assert.equal(diaChicago(finDelDiaChicago("2026-12-07")), "2026-12-07");
});

test("finDelDiaChicago: fecha inválida devuelve NaN", () => {
  assert.ok(Number.isNaN(finDelDiaChicago("")));
  assert.ok(Number.isNaN(finDelDiaChicago("07/12/2026")));
  assert.ok(Number.isNaN(finDelDiaChicago("2026-02-31")));
});

/* ---------- Modo de Stripe (C1) ---------- */

test("admin: listar y obtenerNegocio usan el modo de Stripe actual", async () => {
  const store = nuevo({ estado: "activo", plan: "pro", origen: "stripe", stripe: { status: "active", livemode: false } });
  const l = await listar(ADMIN, true, { store, now: AHORA, stripeLive: true });
  assert.ok(l.ok);
  if (l.ok) assert.deepEqual(l.negocios[0].efectivo, { estado: "sin_plan", plan: null });
  const o = await obtenerNegocio(ADMIN, true, "n1", { store, now: AHORA, stripeLive: false });
  assert.ok(o.ok);
  if (o.ok) assert.deepEqual(o.efectivo, { estado: "activo", plan: "pro" });
});
