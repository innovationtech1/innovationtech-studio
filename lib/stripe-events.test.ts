import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { aplicarEvento, EVENTOS_STRIPE } from "./stripe-events";
import { abrirPortal, comprarPaquete, pagarPlan, prepararStripe, procesarWebhook, type ClienteStripe } from "./stripe-api";
import type { Usuario } from "./account-store";
import { memoryStore, type MemoryStore } from "./account-store-memory";
import { mezclarConfig, type Negocio, type PlanesConfig } from "./plans";

const AHORA = Date.parse("2026-11-07T18:00:00Z");
const T = Math.floor(AHORA / 1000); // segundos, como los manda Stripe
const DIA = 24 * 60 * 60 * 1000;
const SECRETO = "whsec_prueba_123";
const ADMIN = "admin@ejemplo.com";
const PRECIO_B = "price_basico";
const PRECIO_P = "price_pro";
const ORIGEN = "https://studio.ejemplo.com";

const CONFIG: Partial<PlanesConfig> = {
  precios: { basico: { monto: 19, stripePriceId: PRECIO_B }, pro: { monto: 39, stripePriceId: PRECIO_P } },
};
const cfg = mezclarConfig(CONFIG);

function negocio(extra: Partial<Negocio> = {}): Negocio {
  return {
    id: "n1",
    nombre: "Tortas",
    duenoUid: "u1",
    miembros: ["u1", "u2"],
    plan: null,
    estado: "prueba",
    origen: null,
    pruebaHasta: AHORA - DIA,
    creado: AHORA - 5 * DIA,
    actualizado: AHORA - 5 * DIA,
    ...extra,
  };
}
const conStripe = (stripe: Negocio["stripe"], extra: Partial<Negocio> = {}) =>
  negocio({ origen: "stripe", estado: "activo", plan: "basico", stripe, ...extra });

const dueno: Usuario = { uid: "u1", email: "dueno@ejemplo.com", negocioId: "n1", rol: "dueno", creado: AHORA };
const miembro: Usuario = { uid: "u2", email: "miembro@ejemplo.com", negocioId: "n1", rol: "miembro", creado: AHORA };

/* ---------- Eventos hechos a mano ---------- */

let contador = 0;
function evento(type: string, objeto: Record<string, unknown>, created = T, id?: string): Stripe.Event {
  return {
    id: id ?? `evt_${++contador}`,
    object: "event",
    type,
    created,
    api_version: "2026-10-28.endive",
    livemode: false,
    pending_webhooks: 1,
    request: null,
    data: { object: objeto },
  } as unknown as Stripe.Event;
}
const sesion = (extra: Record<string, unknown> = {}) => ({
  id: "cs_1",
  object: "checkout.session",
  mode: "subscription",
  client_reference_id: "n1",
  customer: "cus_1",
  subscription: "sub_1",
  metadata: { negocioId: "n1" },
  ...extra,
});
const suscripcion = (extra: Record<string, unknown> = {}, precio = PRECIO_P) => ({
  id: "sub_1",
  object: "subscription",
  customer: "cus_1",
  status: "active",
  metadata: { negocioId: "n1" },
  items: {
    object: "list",
    data: [{ id: "si_1", object: "subscription_item", price: { id: precio }, current_period_end: T + 30 * 86400 }],
  },
  ...extra,
});
const factura = (sub = "sub_1", extra: Record<string, unknown> = {}) => ({
  id: "in_1",
  object: "invoice",
  customer: "cus_1",
  parent: { type: "subscription_details", subscription_details: { subscription: sub, metadata: { negocioId: "n1" } } },
  ...extra,
});

// Aplica los cambios como lo haría la base, para encadenar eventos en las pruebas
const aplicar = (n: Negocio, c: Partial<Negocio> | null): Negocio => (c ? { ...n, ...c } : n);

/* ---------- aplicarEvento (función pura) ---------- */

test("checkout completado guarda los ids de Stripe y el origen", () => {
  const c = aplicarEvento(evento("checkout.session.completed", sesion()), negocio(), cfg);
  assert.ok(c);
  assert.equal(c.origen, "stripe");
  assert.equal(c.stripe?.customerId, "cus_1");
  assert.equal(c.stripe?.subscriptionId, "sub_1");
});

test("checkout completado quita la sesión pendiente", () => {
  const n = negocio({ stripe: { checkoutPendiente: "cs_1" } });
  const c = aplicarEvento(evento("checkout.session.completed", sesion()), n, cfg);
  assert.equal(c?.stripe?.checkoutPendiente, undefined);
  assert.equal("checkoutPendiente" in (c?.stripe ?? {}), false);
});

test("checkout de un pago único sin paquete se ignora", () => {
  const { r, avisos, errores } = conAvisos(() => aplicarEvento(evento("checkout.session.completed", sesion({ mode: "payment" })), negocio(), cfg));
  assert.equal(r, null);
  assert.deepEqual([...avisos, ...errores], []);
});

test("suscripción activa con el precio de Pro → plan pro y activo", () => {
  const c = aplicarEvento(evento("customer.subscription.updated", suscripcion()), negocio(), cfg);
  assert.ok(c);
  assert.equal(c.plan, "pro");
  assert.equal(c.estado, "activo");
  assert.equal(c.origen, "stripe");
  assert.equal(c.stripe?.status, "active");
  assert.equal(c.stripe?.priceId, PRECIO_P);
  assert.equal(c.stripe?.subscriptionId, "sub_1");
  assert.equal(c.stripe?.customerId, "cus_1");
  assert.equal(c.stripe?.ultimoEvento, T * 1000);
});

test("suscripción creada con el precio de Básico → plan basico", () => {
  const c = aplicarEvento(evento("customer.subscription.created", suscripcion({}, PRECIO_B)), negocio(), cfg);
  assert.equal(c?.plan, "basico");
  assert.equal(c?.estado, "activo");
});

// Para pruebas que esperan un console.warn
async function callado<T>(fn: () => T | Promise<T>): Promise<{ r: T; avisos: string[] }> {
  const avisos: string[] = [];
  const original = console.warn;
  console.warn = (...a: unknown[]) => void avisos.push(a.map(String).join(" "));
  try {
    return { r: await fn(), avisos };
  } finally {
    console.warn = original;
  }
}

test("un precio desconocido nunca da Pro: queda en Básico y avisa", async () => {
  const n = conStripe({ subscriptionId: "sub_1", status: "active" }, { plan: "pro" });
  const { r: c, avisos } = await callado(() =>
    aplicarEvento(evento("customer.subscription.updated", suscripcion({}, "price_otro")), n, cfg),
  );
  assert.equal(c?.plan, "basico");
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /price_otro/);
});

test("past_due → pausado", () => {
  const n = conStripe({ subscriptionId: "sub_1", customerId: "cus_1", status: "active" });
  const c = aplicarEvento(evento("customer.subscription.updated", suscripcion({ status: "past_due" })), n, cfg);
  assert.equal(c?.estado, "pausado");
  assert.equal(c?.stripe?.status, "past_due");
});

test("suscripción incompleta no cambia el estado (no corta la prueba)", () => {
  const n = negocio({ pruebaHasta: AHORA + DIA });
  const c = aplicarEvento(evento("customer.subscription.created", suscripcion({ status: "incomplete" })), n, cfg);
  assert.ok(c);
  assert.equal(c.estado, undefined);
  assert.equal(c.stripe?.status, "incomplete");
});

test("deleted → pausado y status canceled", () => {
  const n = conStripe({ subscriptionId: "sub_1", customerId: "cus_1", status: "active" });
  const c = aplicarEvento(evento("customer.subscription.deleted", suscripcion({ status: "canceled" })), n, cfg);
  assert.equal(c?.estado, "pausado");
  assert.equal(c?.stripe?.status, "canceled");
});

test("deleted de una suscripción vieja (no la actual) no pausa", () => {
  const n = conStripe({ subscriptionId: "sub_2", customerId: "cus_1", status: "active" });
  const c = aplicarEvento(evento("customer.subscription.deleted", suscripcion({ status: "canceled" })), n, cfg);
  assert.equal(c, null);
});

test("deleted con pago a mano vigente no pausa el negocio", () => {
  const n = conStripe(
    { subscriptionId: "sub_1", status: "canceled" },
    { origen: "manual", pagadoHasta: AHORA + 10 * DIA },
  );
  const c = aplicarEvento(evento("customer.subscription.deleted", suscripcion({ status: "canceled" })), n, cfg);
  assert.ok(c);
  assert.equal(c.estado, undefined);
  assert.equal(c.origen, undefined);
});

test("pago fallido → pausado; invoice.paid después → activo", () => {
  let n = conStripe({ subscriptionId: "sub_1", customerId: "cus_1", status: "active" });
  const fallo = aplicarEvento(evento("invoice.payment_failed", factura(), T), n, cfg);
  assert.equal(fallo?.estado, "pausado");
  n = aplicar(n, fallo);
  const pagado = aplicarEvento(evento("invoice.paid", factura(), T + 60), n, cfg);
  assert.equal(pagado?.estado, "activo");
});

test("invoice.paid de otra suscripción no reactiva", () => {
  const n = conStripe({ subscriptionId: "sub_1", status: "past_due" }, { estado: "pausado" });
  assert.equal(aplicarEvento(evento("invoice.paid", factura("sub_vieja")), n, cfg), null);
  assert.equal(aplicarEvento(evento("invoice.payment_failed", factura("sub_vieja")), n, cfg), null);
});

test("invoice.paid de una suscripción ya cancelada no reactiva", () => {
  const n = conStripe({ subscriptionId: "sub_1", customerId: "cus_1", status: "canceled" }, { estado: "pausado" });
  assert.equal(aplicarEvento(evento("invoice.paid", factura()), n, cfg), null);
});

test("invoice.payment_failed de una suscripción que ya no cobra se ignora", () => {
  const n = conStripe({ subscriptionId: "sub_1", customerId: "cus_1", status: "canceled" }, { estado: "pausado" });
  assert.equal(aplicarEvento(evento("invoice.payment_failed", factura()), n, cfg), null);
});

test("un pago fallido viejo que llega después de uno pagado no pausa", () => {
  let n = conStripe({ subscriptionId: "sub_1", customerId: "cus_1", status: "active" });
  n = aplicar(n, aplicarEvento(evento("invoice.paid", factura(), T + 110), n, cfg));
  assert.equal(n.estado, "activo");
  assert.equal(aplicarEvento(evento("invoice.payment_failed", factura(), T + 100), n, cfg), null);
});

test("invoice sin suscripción guardada todavía se ignora", () => {
  assert.equal(aplicarEvento(evento("invoice.paid", factura()), negocio(), cfg), null);
});

test("updated con created anterior a un deleted ya aplicado → sin cambios", () => {
  let n = conStripe({ subscriptionId: "sub_1", customerId: "cus_1", status: "active" });
  n = aplicar(n, aplicarEvento(evento("customer.subscription.deleted", suscripcion({ status: "canceled" }), T + 100), n, cfg));
  assert.equal(n.estado, "pausado");
  const tarde = aplicarEvento(evento("customer.subscription.updated", suscripcion({ status: "active" }), T + 50), n, cfg);
  assert.equal(tarde, null);
});

test("una suscripción cancelada no revive con un evento del mismo segundo", () => {
  let n = conStripe({ subscriptionId: "sub_1", customerId: "cus_1", status: "active" });
  n = aplicar(n, aplicarEvento(evento("customer.subscription.deleted", suscripcion({ status: "canceled" }), T), n, cfg));
  assert.equal(aplicarEvento(evento("customer.subscription.updated", suscripcion({ status: "active" }), T), n, cfg), null);
});

test("los eventos de factura y checkout no adelantan el reloj (no bloquean a subscription.created)", () => {
  let n = negocio();
  n = aplicar(n, aplicarEvento(evento("checkout.session.completed", sesion(), T + 2), n, cfg));
  n = aplicar(n, aplicarEvento(evento("invoice.paid", factura(), T + 2), n, cfg));
  const creada = aplicarEvento(evento("customer.subscription.created", suscripcion(), T), n, cfg);
  assert.ok(creada, "subscription.created debe aplicarse aunque llegue después");
  assert.equal(creada.estado, "activo");
  assert.equal(creada.stripe?.status, "active");
});

test("después de cancelar, una suscripción nueva se adopta", () => {
  const n = conStripe({ subscriptionId: "sub_vieja", customerId: "cus_1", status: "canceled", ultimoEvento: T * 1000 }, { estado: "pausado" });
  const c = aplicarEvento(evento("customer.subscription.created", suscripcion({ id: "sub_nueva" }), T + 10), n, cfg);
  assert.equal(c?.stripe?.subscriptionId, "sub_nueva");
  assert.equal(c?.estado, "activo");
});

test("otra suscripción viva no reemplaza a la actual (posible doble cobro)", () => {
  const n = conStripe({ subscriptionId: "sub_1", customerId: "cus_1", status: "active" });
  assert.equal(aplicarEvento(evento("customer.subscription.created", suscripcion({ id: "sub_2" })), n, cfg), null);
  assert.equal(aplicarEvento(evento("checkout.session.completed", sesion({ subscription: "sub_2" })), n, cfg), null);
});

test("pasar a tarjeta: suscripción trialing sobre un pago a mano vigente se adopta", () => {
  const n = negocio({ estado: "activo", origen: "manual", plan: "basico", pagadoHasta: AHORA + 30 * DIA });
  const sub = suscripcion({ status: "trialing", trial_end: Math.floor((AHORA + 30 * DIA) / 1000) }, PRECIO_B);
  const c = aplicarEvento(evento("customer.subscription.created", sub), n, cfg);
  assert.ok(c);
  assert.equal(c.origen, "stripe");
  assert.equal(c.estado, "activo");
  assert.equal(c.plan, "basico");
  assert.equal(c.stripe?.status, "trialing");
  assert.equal(c.stripe?.subscriptionId, "sub_1");
});

/* ---------- Paquetes (pago único) ---------- */

const pago = (extra: Record<string, unknown> = {}) => ({
  id: "cs_pago",
  object: "checkout.session",
  mode: "payment",
  payment_status: "paid",
  amount_total: 500,
  currency: "usd",
  customer: "cus_1",
  client_reference_id: "n1",
  metadata: { negocioId: "n1", paquete: "creativo" },
  ...extra,
});

// Captura los console.warn y console.error mientras corre `f` (por separado)
function conAvisos<T>(f: () => T): { r: T; avisos: string[]; errores: string[] } {
  const avisos: string[] = [];
  const errores: string[] = [];
  const [w, e] = [console.warn, console.error];
  console.warn = (...a: unknown[]) => void avisos.push(a.join(" "));
  console.error = (...a: unknown[]) => void errores.push(a.join(" "));
  try {
    return { r: f(), avisos, errores };
  } finally {
    console.warn = w;
    console.error = e;
  }
}

// Un pago que no se acredita se anota como error con lo necesario para agregarlo a mano
function esErrorDeAcreditar(errores: string[], sesion = "cs_pago", negocioId = "n1") {
  assert.equal(errores.length, 1);
  assert.ok(errores[0].includes(sesion), errores[0]);
  assert.ok(errores[0].includes(negocioId), errores[0]);
  assert.ok(errores[0].includes("agrégalo a mano en /admin (Agregar paquete)"), errores[0]);
}

test("paquete pagado (completed + paid) suma al saldo existente", () => {
  const n = negocio({ paquetes: { textos: 10, voces: 3 } });
  const c = aplicarEvento(evento("checkout.session.completed", pago()), n, cfg);
  assert.deepEqual(c, { paquetes: { textos: 510, imagenes: 150, voces: 3 } });
});

test("paquete: completed unpaid → null sin aviso; async_payment_succeeded de la misma sesión acredita", () => {
  const { r, avisos } = conAvisos(() =>
    aplicarEvento(evento("checkout.session.completed", pago({ payment_status: "unpaid" })), negocio(), cfg),
  );
  assert.equal(r, null);
  assert.deepEqual(avisos, []);
  const c = aplicarEvento(evento("checkout.session.async_payment_succeeded", pago({ payment_status: "unpaid" })), negocio(), cfg);
  assert.deepEqual(c, { paquetes: { textos: 500, imagenes: 150 } });
});

test("paquete: un aviso viejo (anterior al reloj de la suscripción) igual acredita", () => {
  const n = conStripe({ subscriptionId: "sub_1", status: "active", ultimoEvento: (T + 1000) * 1000, livemode: false });
  const c = aplicarEvento(evento("checkout.session.completed", pago()), n, cfg);
  assert.deepEqual(c, { paquetes: { textos: 500, imagenes: 150 } });
});

test("paquete: monto distinto → null con error para agregarlo a mano", () => {
  const { r, avisos, errores } = conAvisos(() => aplicarEvento(evento("checkout.session.completed", pago({ amount_total: 100 })), negocio(), cfg));
  assert.equal(r, null);
  assert.deepEqual(avisos, []);
  esErrorDeAcreditar(errores);
});

test("paquete: moneda distinta → null con error para agregarlo a mano", () => {
  const { r, avisos, errores } = conAvisos(() => aplicarEvento(evento("checkout.session.completed", pago({ currency: "mxn" })), negocio(), cfg));
  assert.equal(r, null);
  assert.deepEqual(avisos, []);
  esErrorDeAcreditar(errores);
});

test("paquete: id de paquete inválido → null con error para agregarlo a mano", () => {
  const { r, avisos, errores } = conAvisos(() =>
    aplicarEvento(evento("checkout.session.completed", pago({ metadata: { negocioId: "n1", paquete: "gratis" } })), negocio(), cfg),
  );
  assert.equal(r, null);
  assert.deepEqual(avisos, []);
  esErrorDeAcreditar(errores);
});

test("paquete: de otro negocio → null con error para agregarlo a mano", () => {
  const { r, avisos, errores } = conAvisos(() =>
    aplicarEvento(evento("checkout.session.completed", pago({ metadata: { negocioId: "n2", paquete: "creativo" } })), negocio(), cfg),
  );
  assert.equal(r, null);
  assert.deepEqual(avisos, []);
  esErrorDeAcreditar(errores);
});

test("paquete: el error no menciona secretos ni datos de pago", () => {
  const { errores } = conAvisos(() => aplicarEvento(evento("checkout.session.completed", pago({ amount_total: 1 })), negocio(), cfg));
  assert.equal(errores.length, 1);
  assert.ok(!/cus_|whsec|sk_/.test(errores.join(" ")));
});

test("paquete: un pago único sin paquete en metadata (p. ej. de otra app) se ignora sin anotar nada", () => {
  for (const metadata of [{}, { negocioId: "n1" }, undefined]) {
    const { r, avisos, errores } = conAvisos(() =>
      aplicarEvento(evento("checkout.session.completed", pago({ metadata })), negocio(), cfg),
    );
    assert.equal(r, null);
    assert.deepEqual(avisos, []);
    assert.deepEqual(errores, []);
  }
});

test("paquete: una suscripción sigue igual (regresión)", () => {
  const c = aplicarEvento(evento("checkout.session.completed", sesion()), negocio(), cfg);
  assert.equal(c?.origen, "stripe");
  assert.equal(c?.stripe?.subscriptionId, "sub_1");
  assert.equal(c?.paquetes, undefined);
});

test("un evento de otro tipo no hace nada", () => {
  assert.equal(aplicarEvento(evento("charge.succeeded", { id: "ch_1" }), negocio(), cfg), null);
});

/* ---------- Webhook ---------- */

const webhooks = Stripe.webhooks;
function firmado(ev: Stripe.Event) {
  const cuerpo = JSON.stringify(ev);
  return { cuerpo, firma: webhooks.generateTestHeaderString({ payload: cuerpo, secret: SECRETO }) };
}
const nuevoStore = (n: Negocio = negocio()) => memoryStore({ negocios: [n], usuarios: [dueno, miembro], config: CONFIG });
const depsW = (store: MemoryStore) => ({ store, secreto: SECRETO, now: AHORA });

test("webhook: firma inválida o ausente → 400", async () => {
  const store = nuevoStore();
  const { cuerpo } = firmado(evento("customer.subscription.updated", suscripcion()));
  assert.equal((await procesarWebhook(cuerpo, "t=1,v1=malo", depsW(store))).status, 400);
  assert.equal((await procesarWebhook(cuerpo, null, depsW(store))).status, 400);
  const otro = webhooks.generateTestHeaderString({ payload: cuerpo, secret: "whsec_otro" });
  assert.equal((await procesarWebhook(cuerpo, otro, depsW(store))).status, 400);
  assert.equal((await store.getNegocio("n1"))?.estado, "prueba");
});

test("webhook: sin STRIPE_WEBHOOK_SECRET → 503", async () => {
  const guardado = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const { cuerpo, firma } = firmado(evento("customer.subscription.updated", suscripcion()));
    const r = await procesarWebhook(cuerpo, firma, { store: nuevoStore(), now: AHORA });
    assert.equal(r.status, 503);
  } finally {
    if (guardado !== undefined) process.env.STRIPE_WEBHOOK_SECRET = guardado;
  }
});

test("webhook: evento firmado se aplica al negocio", async () => {
  const store = nuevoStore();
  const { cuerpo, firma } = firmado(evento("customer.subscription.created", suscripcion()));
  const r = await procesarWebhook(cuerpo, firma, depsW(store));
  assert.equal(r.status, 200);
  const n = await store.getNegocio("n1");
  assert.equal(n?.plan, "pro");
  assert.equal(n?.estado, "activo");
  assert.equal(n?.origen, "stripe");
  assert.equal(n?.actualizado, AHORA);
});

test("webhook: el mismo evento dos veces se aplica una sola vez", async () => {
  const store = nuevoStore(conStripe({ subscriptionId: "sub_1", customerId: "cus_1", status: "active" }));
  const { cuerpo, firma } = firmado(evento("invoice.paid", factura(), T, "evt_repetido"));
  assert.equal((await procesarWebhook(cuerpo, firma, depsW(store))).status, 200);
  // El administrador pausa a mano entre las dos entregas
  await store.actualizarNegocio("n1", { estado: "pausado" });
  const r = await procesarWebhook(cuerpo, firma, depsW(store));
  assert.equal(r.status, 200);
  assert.equal(r.body.duplicado, true);
  assert.equal((await store.getNegocio("n1"))?.estado, "pausado");
});

test("webhook: paquete entregado dos veces se acredita una sola vez", async () => {
  const store = nuevoStore(negocio({ paquetes: { textos: 10 } }));
  const { cuerpo, firma } = firmado(evento("checkout.session.completed", pago(), T, "evt_paquete"));
  assert.equal((await procesarWebhook(cuerpo, firma, depsW(store))).status, 200);
  const r = await procesarWebhook(cuerpo, firma, depsW(store));
  assert.equal(r.body.duplicado, true);
  assert.deepEqual((await store.getNegocio("n1"))?.paquetes, { textos: 510, imagenes: 150 });
});

test("webhook: async_payment_succeeded de un paquete se procesa y acredita", async () => {
  const store = nuevoStore();
  const { cuerpo, firma } = firmado(evento("checkout.session.async_payment_succeeded", pago({ client_reference_id: undefined })));
  assert.equal((await procesarWebhook(cuerpo, firma, depsW(store))).status, 200);
  assert.deepEqual((await store.getNegocio("n1"))?.paquetes, { textos: 500, imagenes: 150 });
});

test("EVENTOS_STRIPE incluye async_payment_succeeded (7 en total)", () => {
  assert.equal(EVENTOS_STRIPE.length, 7);
  assert.ok((EVENTOS_STRIPE as readonly string[]).includes("checkout.session.async_payment_succeeded"));
});

test("webhook: busca el negocio por customer si no hay metadata", async () => {
  const store = nuevoStore(conStripe({ subscriptionId: "sub_1", customerId: "cus_1", status: "active" }));
  const ev = evento("customer.subscription.updated", suscripcion({ metadata: {}, status: "past_due" }));
  const { cuerpo, firma } = firmado(ev);
  assert.equal((await procesarWebhook(cuerpo, firma, depsW(store))).status, 200);
  assert.equal((await store.getNegocio("n1"))?.estado, "pausado");
});

test("webhook: negocio desconocido → 200 sin cambios", async () => {
  const store = nuevoStore();
  const ev = evento("customer.subscription.updated", suscripcion({ metadata: { negocioId: "nadie" }, customer: "cus_x" }));
  const { cuerpo, firma } = firmado(ev);
  assert.equal((await procesarWebhook(cuerpo, firma, depsW(store))).status, 200);
  assert.equal((await store.getNegocio("n1"))?.estado, "prueba");
});

test("webhook: tipo no manejado → 200", async () => {
  const store = nuevoStore();
  const { cuerpo, firma } = firmado(evento("charge.succeeded", { id: "ch_1", customer: "cus_1" }));
  assert.equal((await procesarWebhook(cuerpo, firma, depsW(store))).status, 200);
});

test("webhook: si falla a medias → 500 sin marca; el reintento se aplica y el repetido se salta", async () => {
  const base = nuevoStore();
  let fallar = true;
  const store: MemoryStore = {
    ...base,
    async modificarNegocio(id, fn, op) {
      if (fallar) {
        fallar = false;
        // Falla dentro de la transacción: no debe quedar ni el cambio ni la marca
        return base.modificarNegocio(id, () => {
          throw new Error("Firestore no responde");
        }, op);
      }
      return base.modificarNegocio(id, fn, op);
    },
  };
  const { cuerpo, firma } = firmado(evento("customer.subscription.created", suscripcion(), T, "evt_reintento"));
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal((await procesarWebhook(cuerpo, firma, depsW(store))).status, 500);
  } finally {
    console.error = original;
  }
  assert.equal(base.eventoMarcado("evt_reintento"), false);
  assert.equal((await base.getNegocio("n1"))?.estado, "prueba");

  const r = await procesarWebhook(cuerpo, firma, depsW(store));
  assert.equal(r.status, 200);
  assert.notEqual(r.body.duplicado, true);
  assert.equal((await base.getNegocio("n1"))?.estado, "activo");
  assert.equal(base.eventoMarcado("evt_reintento"), true);

  await base.actualizarNegocio("n1", { estado: "pausado" });
  const r3 = await procesarWebhook(cuerpo, firma, depsW(store));
  assert.equal(r3.body.duplicado, true);
  assert.equal((await base.getNegocio("n1"))?.estado, "pausado");
});

/* ---------- Cliente de Stripe falso (solo lo que se usa) ---------- */

type Llamada = { metodo: string; args: unknown[] };
function stripeFalso(op: {
  precios?: Array<{ id: string; lookup_key: string; unit_amount: number; currency?: string; interval?: string }>;
  suscripciones?: Array<Record<string, unknown>>;
  sesiones?: Record<string, { status: string; subscription?: string; customer?: string }>;
  expirarFalla?: boolean; // simula que la pagaron justo antes de vencerla
  sinCliente?: string[]; // customers que Stripe no conoce (p. ej. de otro modo)
  registrarSesiones?: boolean; // las sesiones creadas quedan abiertas (cs_nuevo_1, cs_nuevo_2…)
} = {}) {
  const noHayCliente = (c: unknown) => {
    if (typeof c === "string" && op.sinCliente?.includes(c)) {
      throw Object.assign(new Error(`No such customer: '${c}'`), { type: "StripeInvalidRequestError", code: "resource_missing", statusCode: 404 });
    }
  };
  const sesiones = { ...(op.sesiones ?? {}) };
  const llamadas: Llamada[] = [];
  const precios = [...(op.precios ?? [])];
  const subs = [...(op.suscripciones ?? [])];
  let n = 0;
  const anotar = (metodo: string, ...args: unknown[]) => llamadas.push({ metodo, args });
  const cliente = {
    prices: {
      async list(p: { lookup_keys?: string[] }) {
        anotar("prices.list", p);
        const data = precios
          .filter((x) => p.lookup_keys?.includes(x.lookup_key))
          .map((x) => ({
            id: x.id,
            lookup_key: x.lookup_key,
            unit_amount: x.unit_amount,
            currency: x.currency ?? "usd",
            // Los paquetes son de pago único (sin recurring)
            recurring: x.lookup_key.includes("paquete") ? null : { interval: x.interval ?? "month" },
            active: true,
          }));
        return { data };
      },
      async create(p: { lookup_key: string; unit_amount: number }) {
        anotar("prices.create", p);
        const nuevo = { id: `price_nuevo_${++n}`, lookup_key: p.lookup_key, unit_amount: p.unit_amount };
        precios.push(nuevo);
        const unico = p.lookup_key.includes("paquete");
        return { ...nuevo, currency: "usd", recurring: unico ? null : { interval: "month" } };
      },
    },
    checkout: {
      sessions: {
        async create(p: { customer?: string }) {
          anotar("checkout.sessions.create", p);
          noHayCliente(p.customer);
          const id = op.registrarSesiones ? `cs_nuevo_${++n}` : "cs_nuevo";
          if (op.registrarSesiones) sesiones[id] = { status: "open" };
          return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
        },
        async retrieve(id: string) {
          anotar("checkout.sessions.retrieve", id);
          const x = sesiones[id];
          if (!x) throw Object.assign(new Error("No such session"), { code: "resource_missing", statusCode: 404 });
          return { id, ...x };
        },
        async expire(id: string) {
          anotar("checkout.sessions.expire", id);
          if (op.expirarFalla) {
            sesiones[id] = { ...sesiones[id], status: "complete" };
            throw Object.assign(new Error("Session is not open"), { statusCode: 400 });
          }
          sesiones[id] = { ...sesiones[id], status: "expired" };
          return { id, ...sesiones[id] };
        },
      },
    },
    billingPortal: {
      sessions: {
        async create(p: { customer?: string }) {
          anotar("billingPortal.sessions.create", p);
          noHayCliente(p.customer);
          return { id: "bps_1", url: "https://billing.stripe.com/p/session/bps_1" };
        },
      },
    },
    subscriptions: {
      async retrieve(id: string) {
        anotar("subscriptions.retrieve", id);
        const s = subs.find((x) => x.id === id);
        if (!s) {
          throw Object.assign(new Error("No such subscription"), { type: "StripeInvalidRequestError", code: "resource_missing", statusCode: 404 });
        }
        return s;
      },
      async list(p: { customer?: string }) {
        anotar("subscriptions.list", p);
        noHayCliente(p.customer);
        return { data: subs };
      },
      async update(id: string, p: unknown) {
        anotar("subscriptions.update", id, p);
        return { ...subs.find((x) => x.id === id), id };
      },
    },
  };
  return { cliente: cliente as unknown as ClienteStripe, llamadas, metodos: () => llamadas.map((l) => l.metodo) };
}

/* ---------- Preparar Stripe (admin) ---------- */

const guardadoAdmin = process.env.STUDIO_ADMIN_EMAILS;
beforeEach(() => {
  process.env.STUDIO_ADMIN_EMAILS = ADMIN;
});
afterEach(() => {
  if (guardadoAdmin === undefined) delete process.env.STUDIO_ADMIN_EMAILS;
  else process.env.STUDIO_ADMIN_EMAILS = guardadoAdmin;
});

test("prepararStripe: solo el administrador (403)", async () => {
  const f = stripeFalso();
  const store = memoryStore();
  for (const r of [
    await prepararStripe("otro@x.com", true, { store, stripe: f.cliente }),
    await prepararStripe(ADMIN, false, { store, stripe: f.cliente }),
  ]) {
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 403);
  }
  assert.equal(f.llamadas.length, 0);
});

test("prepararStripe: crea los dos precios y guarda los ids; la segunda vez no crea nada", async () => {
  const f = stripeFalso();
  const store = memoryStore();
  const r = await prepararStripe(ADMIN, true, { store, stripe: f.cliente });
  assert.equal(r.ok, true);
  const creados = f.llamadas.filter((l) => l.metodo === "prices.create").map((l) => l.args[0] as Record<string, unknown>);
  assert.equal(creados.length, 4);
  const basico = creados.find((c) => c.lookup_key === "studio_basico_mensual")!;
  const pro = creados.find((c) => c.lookup_key === "studio_pro_mensual")!;
  assert.equal(basico.unit_amount, 1900);
  assert.equal(pro.unit_amount, 3900);
  assert.equal(basico.currency, "usd");
  assert.deepEqual(basico.recurring, { interval: "month" });
  assert.equal((basico.product_data as { name: string }).name, "Studio Básico");
  assert.equal((pro.product_data as { name: string }).name, "Studio Pro");
  const listado = f.llamadas.find((l) => l.metodo === "prices.list")!.args[0] as Record<string, unknown>;
  assert.deepEqual(listado.lookup_keys, [
    "studio_basico_mensual",
    "studio_pro_mensual",
    "studio_paquete_creativo",
    "studio_paquete_voz",
  ]);
  // Paquetes: pago único (sin recurring), en dólares
  const creativo = creados.find((c) => c.lookup_key === "studio_paquete_creativo")!;
  const voz = creados.find((c) => c.lookup_key === "studio_paquete_voz")!;
  assert.equal(creativo.unit_amount, 500);
  assert.equal(voz.unit_amount, 900);
  for (const c of [creativo, voz]) {
    assert.equal(c.currency, "usd");
    assert.equal("recurring" in c, false);
  }
  assert.equal((creativo.product_data as { name: string }).name, "Studio Paquete Creativo");
  assert.equal((voz.product_data as { name: string }).name, "Studio Paquete Voz");

  const cfgG = await store.getConfig();
  assert.ok(cfgG.precios.basico.stripePriceId?.startsWith("price_nuevo_"));
  assert.ok(cfgG.precios.pro.stripePriceId?.startsWith("price_nuevo_"));
  assert.equal(cfgG.precios.basico.monto, 19);
  assert.equal(cfgG.precios.pro.monto, 39);
  assert.ok(cfgG.paquetes.creativo.stripePriceId?.startsWith("price_nuevo_"));
  assert.ok(cfgG.paquetes.voz.stripePriceId?.startsWith("price_nuevo_"));
  // Guardar el id no borra monto, contenido ni planes del paquete
  assert.equal(cfgG.paquetes.voz.monto, 9);
  assert.deepEqual(cfgG.paquetes.voz.contenido, { voces: 100, subtitulos: 100 });
  assert.deepEqual(cfgG.paquetes.voz.planes, ["pro"]);
  // El resto de la configuración no se toca
  assert.deepEqual(cfgG.limitesMes, mezclarConfig(null).limitesMes);
  if (r.ok) {
    assert.deepEqual(r.precios, { basico: cfgG.precios.basico.stripePriceId, pro: cfgG.precios.pro.stripePriceId });
    assert.deepEqual(r.paquetes, { creativo: cfgG.paquetes.creativo.stripePriceId, voz: cfgG.paquetes.voz.stripePriceId });
  }

  const r2 = await prepararStripe(ADMIN, true, { store, stripe: f.cliente });
  assert.equal(r2.ok, true);
  assert.equal(f.llamadas.filter((l) => l.metodo === "prices.create").length, 4);
  assert.deepEqual((await store.getConfig()).precios, cfgG.precios);
  assert.deepEqual((await store.getConfig()).paquetes, cfgG.paquetes);
});

test("prepararStripe: si ya existe uno, solo crea el que falta", async () => {
  const f = stripeFalso({ precios: [{ id: "price_b_viejo", lookup_key: "studio_basico_mensual", unit_amount: 1900 }] });
  const store = memoryStore();
  const r = await prepararStripe(ADMIN, true, { store, stripe: f.cliente });
  assert.equal(r.ok, true);
  assert.equal(f.llamadas.filter((l) => l.metodo === "prices.create").length, 3); // pro + 2 paquetes
  assert.equal((await store.getConfig()).precios.basico.stripePriceId, "price_b_viejo");
});

test("prepararStripe: un precio existente con otro monto es un error (no se usa)", async () => {
  const f = stripeFalso({ precios: [{ id: "price_raro", lookup_key: "studio_pro_mensual", unit_amount: 999 }] });
  const store = memoryStore();
  const r = await prepararStripe(ADMIN, true, { store, stripe: f.cliente });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 409);
  assert.equal((await store.getConfig()).precios.pro.stripePriceId, undefined);
});

test("sin STRIPE_SECRET_KEY las funciones responden 503", async () => {
  const guardado = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const store = nuevoStore();
    const msg = "El pago con tarjeta todavía no está configurado.";
    for (const r of [
      await prepararStripe(ADMIN, true, { store }),
      await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, { store, now: AHORA }),
      await abrirPortal("u1", ORIGEN, { store }),
    ]) {
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.status, 503);
        assert.equal(r.error, msg);
      }
    }
  } finally {
    if (guardado !== undefined) process.env.STRIPE_SECRET_KEY = guardado;
  }
});

/* ---------- Checkout ---------- */

const depsP = (store: MemoryStore, cliente: ClienteStripe) => ({ store, stripe: cliente, now: AHORA });

test("checkout: solo el dueño puede pagar (403)", async () => {
  const f = stripeFalso();
  const r = await pagarPlan("u2", "miembro@ejemplo.com", "pro", ORIGEN, depsP(nuevoStore(), f.cliente));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 403);
    assert.equal(r.error, "Solo el dueño del negocio puede pagar el plan.");
  }
  assert.equal(f.llamadas.length, 0);
});

test("checkout: plan inválido (400)", async () => {
  const f = stripeFalso();
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "prueba", ORIGEN, depsP(nuevoStore(), f.cliente));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 400);
    assert.equal(r.error, "Elige Básico o Pro.");
  }
});

test("checkout: sin precios preparados (503)", async () => {
  const f = stripeFalso();
  const store = memoryStore({ negocios: [negocio()], usuarios: [dueno] });
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 503);
    assert.equal(r.error, "El pago con tarjeta todavía no está configurado.");
  }
});

/* ---------- Pasar de pago a mano a tarjeta ---------- */

const HORA = 60 * 60 * 1000;
// Como el negocio 053: Básico pagado a mano hasta el fin del 7 de diciembre (hora de Chicago)
const FIN_MANUAL = Date.parse("2026-12-08T05:59:59Z");
const aMano = (extra: Partial<Negocio> = {}) =>
  negocio({ estado: "activo", origen: "manual", plan: "basico", pagadoHasta: FIN_MANUAL, ...extra });

test("pago a mano vigente, mismo plan: Checkout de suscripción con prueba hasta que vence lo pagado", async () => {
  const f = stripeFalso();
  const store = nuevoStore(aMano());
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "basico", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.url, "https://checkout.stripe.com/c/pay/cs_nuevo");
  const p = f.llamadas.find((l) => l.metodo === "checkout.sessions.create")!.args[0] as Record<string, unknown>;
  assert.equal(p.mode, "subscription");
  assert.deepEqual(p.line_items, [{ price: PRECIO_B, quantity: 1 }]);
  assert.deepEqual(p.subscription_data, { metadata: { negocioId: "n1" }, trial_end: Math.floor(FIN_MANUAL / 1000) });
  assert.deepEqual(p.metadata, { negocioId: "n1" });
  assert.equal((await store.getNegocio("n1"))?.stripe?.checkoutPendiente, "cs_nuevo");
});

test("pago a mano vigente, otro plan → 400 «Para cambiar de plan, escríbenos.» sin tocar Stripe", async () => {
  const f = stripeFalso();
  const store = nuevoStore(aMano());
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 400);
    assert.equal(r.error, "Tu plan está pagado a mano hasta 7 de diciembre de 2026. Para cambiar de plan, escríbenos.");
  }
  assert.equal(f.llamadas.length, 0);
});

test("pago a mano que vence en menos de 48 h → 400 «Ese día podrás poner tu tarjeta.» sin tocar Stripe", async () => {
  const f = stripeFalso();
  const store = nuevoStore(aMano({ pagadoHasta: AHORA + 24 * HORA }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "basico", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 400);
    assert.equal(r.error, "Tu plan está pagado a mano hasta el 8 de noviembre. Ese día podrás poner tu tarjeta.");
  }
  assert.equal(f.llamadas.length, 0);
});

test("pago a mano vigente pero pausado → 400 sin tocar Stripe", async () => {
  const f = stripeFalso();
  const store = nuevoStore(aMano({ estado: "pausado" }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "basico", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
  assert.equal(f.llamadas.length, 0);
});

test("pasar a tarjeta dos veces seguidas: la segunda vence la sesión abierta (nunca dos a la vez)", async () => {
  const f = stripeFalso({ registrarSesiones: true });
  const store = nuevoStore(aMano());
  const r1 = await pagarPlan("u1", "dueno@ejemplo.com", "basico", ORIGEN, depsP(store, f.cliente));
  const r2 = await pagarPlan("u1", "dueno@ejemplo.com", "basico", ORIGEN, depsP(store, f.cliente));
  assert.equal(r1.ok && r2.ok, true);
  const creadas = f.llamadas.filter((l) => l.metodo === "checkout.sessions.create");
  assert.equal(creadas.length, 2);
  for (const c of creadas) {
    assert.equal((c.args[0] as { subscription_data: { trial_end: number } }).subscription_data.trial_end, Math.floor(FIN_MANUAL / 1000));
  }
  const m = f.metodos();
  assert.deepEqual(f.llamadas.filter((l) => l.metodo === "checkout.sessions.expire").map((l) => l.args[0]), ["cs_nuevo_1"]);
  assert.ok(m.lastIndexOf("checkout.sessions.expire") < m.lastIndexOf("checkout.sessions.create"));
  assert.equal((await store.getNegocio("n1"))?.stripe?.checkoutPendiente, "cs_nuevo_2");
});

test("pasar a tarjeta con la primera sesión ya pagada (sin aviso todavía) → no se crea otra", async () => {
  const f = stripeFalso({
    sesiones: { cs_viejo: { status: "complete", subscription: "sub_1", customer: "cus_1" } },
    suscripciones: [subViva("trialing", PRECIO_B)],
  });
  const store = nuevoStore(aMano({ stripe: { checkoutPendiente: "cs_viejo" } }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "basico", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  assert.equal(f.metodos().includes("checkout.sessions.create"), false);
  if (r.ok) assert.equal(r.url, "https://billing.stripe.com/p/session/bps_1");
});

test("pago a mano vigente con una suscripción viva en Stripe → se usa esa (no Checkout nuevo)", async () => {
  const f = stripeFalso({ suscripciones: [subViva("trialing", PRECIO_B)] });
  const store = nuevoStore(aMano({ stripe: { customerId: "cus_1", subscriptionId: "sub_1" } }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "basico", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  assert.equal(f.metodos().includes("checkout.sessions.create"), false);
  assert.ok(f.metodos().includes("billingPortal.sessions.create"));
});

test("checkout nuevo: parámetros correctos (sin payment_method_types)", async () => {
  const f = stripeFalso();
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(nuevoStore(), f.cliente));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.url, "https://checkout.stripe.com/c/pay/cs_nuevo");
  const p = f.llamadas.find((l) => l.metodo === "checkout.sessions.create")!.args[0] as Record<string, unknown>;
  assert.equal(p.mode, "subscription");
  assert.deepEqual(p.line_items, [{ price: PRECIO_P, quantity: 1 }]);
  assert.equal(p.client_reference_id, "n1");
  assert.equal(p.customer_email, "dueno@ejemplo.com");
  assert.equal(p.customer, undefined);
  assert.equal(p.success_url, `${ORIGEN}/?pago=ok`);
  assert.equal(p.cancel_url, `${ORIGEN}/?pago=cancelado`);
  assert.deepEqual(p.metadata, { negocioId: "n1" });
  assert.deepEqual(p.subscription_data, { metadata: { negocioId: "n1" } });
  assert.equal("payment_method_types" in p, false);
});

test("checkout nuevo: con customer guardado usa customer (sin correo)", async () => {
  const f = stripeFalso();
  const store = nuevoStore(conStripe({ customerId: "cus_1", subscriptionId: "sub_vieja", status: "canceled" }, { estado: "pausado" }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "basico", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  const p = f.llamadas.find((l) => l.metodo === "checkout.sessions.create")!.args[0] as Record<string, unknown>;
  assert.equal(p.customer, "cus_1");
  assert.equal("customer_email" in p, false);
  assert.deepEqual(p.line_items, [{ price: PRECIO_B, quantity: 1 }]);
});

const subViva = (status: string, precio: string, id = "sub_1") => ({
  id,
  status,
  customer: "cus_1",
  items: { data: [{ id: "si_1", price: { id: precio } }] },
});

test("ya suscrito, otro plan: cambia la suscripción con prorrateo (no crea otro checkout)", async () => {
  const f = stripeFalso({ suscripciones: [subViva("active", PRECIO_B)] });
  const store = nuevoStore(conStripe({ customerId: "cus_1", subscriptionId: "sub_1", status: "active", priceId: PRECIO_B }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.url, `${ORIGEN}/?pago=ok`);
  assert.equal(f.metodos().includes("checkout.sessions.create"), false);
  const u = f.llamadas.find((l) => l.metodo === "subscriptions.update")!;
  assert.equal(u.args[0], "sub_1");
  assert.deepEqual(u.args[1], { items: [{ id: "si_1", price: PRECIO_P }], proration_behavior: "create_prorations" });
});

test("ya suscrito, mismo plan: manda al portal", async () => {
  const f = stripeFalso({ suscripciones: [subViva("active", PRECIO_P)] });
  const store = nuevoStore(conStripe({ customerId: "cus_1", subscriptionId: "sub_1", status: "active" }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.url, "https://billing.stripe.com/p/session/bps_1");
  assert.deepEqual(f.metodos(), ["subscriptions.retrieve", "billingPortal.sessions.create"]);
  const p = f.llamadas[1].args[0] as Record<string, unknown>;
  assert.deepEqual(p, { customer: "cus_1", return_url: `${ORIGEN}/` });
});

test("suscripción con pago pendiente (past_due): manda al portal a pagar, no cambia de plan", async () => {
  const f = stripeFalso({ suscripciones: [subViva("past_due", PRECIO_B)] });
  const store = nuevoStore(conStripe({ customerId: "cus_1", subscriptionId: "sub_1", status: "past_due" }, { estado: "pausado" }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  assert.equal(f.metodos().includes("subscriptions.update"), false);
  assert.equal(f.metodos().includes("checkout.sessions.create"), false);
  assert.ok(f.metodos().includes("billingPortal.sessions.create"));
});

test("unpaid también cuenta como suscripción viva (no hay checkout nuevo)", async () => {
  const f = stripeFalso({ suscripciones: [subViva("unpaid", PRECIO_P)] });
  const store = nuevoStore(conStripe({ customerId: "cus_1", subscriptionId: "sub_1", status: "unpaid" }, { estado: "pausado" }));
  await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal(f.metodos().includes("checkout.sessions.create"), false);
});

test("Stripe dice que la suscripción guardada está cancelada → checkout nuevo", async () => {
  const f = stripeFalso({ suscripciones: [subViva("canceled", PRECIO_P)] });
  // En nuestra base todavía dice active (el aviso no llegó), pero Stripe manda
  const store = nuevoStore(conStripe({ customerId: "cus_1", subscriptionId: "sub_1", status: "active" }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  assert.ok(f.metodos().includes("checkout.sessions.create"));
});

test("hay customer pero no subscriptionId: revisa las suscripciones del customer", async () => {
  const f = stripeFalso({ suscripciones: [subViva("active", PRECIO_B, "sub_9")] });
  const store = nuevoStore(negocio({ stripe: { customerId: "cus_1" } }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  const listado = f.llamadas.find((l) => l.metodo === "subscriptions.list")!.args[0] as Record<string, unknown>;
  assert.equal(listado.customer, "cus_1");
  assert.equal(listado.status, "all");
  assert.equal(f.metodos().includes("checkout.sessions.create"), false);
  assert.equal(f.llamadas.find((l) => l.metodo === "subscriptions.update")!.args[0], "sub_9");
});

test("si Stripe falla, responde 502 con un mensaje amable", async () => {
  const f = stripeFalso();
  (f.cliente.checkout.sessions as { create: unknown }).create = async () => {
    throw new Error("conexión");
  };
  const original = console.error;
  console.error = () => {};
  try {
    const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(nuevoStore(), f.cliente));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 502);
  } finally {
    console.error = original;
  }
});

test("checkout nuevo: guarda la sesión como pendiente", async () => {
  const f = stripeFalso();
  const store = nuevoStore();
  await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal((await store.getNegocio("n1"))?.stripe?.checkoutPendiente, "cs_nuevo");
});

test("segundo checkout con el primero ya pagado (sin aviso todavía) → no se crea otro", async () => {
  const f = stripeFalso({
    sesiones: { cs_viejo: { status: "complete", subscription: "sub_1", customer: "cus_1" } },
    suscripciones: [subViva("active", PRECIO_P)],
  });
  const store = nuevoStore(negocio({ stripe: { checkoutPendiente: "cs_viejo" } }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  assert.equal(f.metodos().includes("checkout.sessions.create"), false);
  // Mismo plan: al portal del customer de esa suscripción
  if (r.ok) assert.equal(r.url, "https://billing.stripe.com/p/session/bps_1");
});

test("segundo checkout con el primero abierto → se vence el viejo y se crea uno nuevo", async () => {
  const f = stripeFalso({ sesiones: { cs_viejo: { status: "open" } } });
  const store = nuevoStore(negocio({ stripe: { checkoutPendiente: "cs_viejo" } }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  const m = f.metodos();
  assert.ok(m.indexOf("checkout.sessions.expire") >= 0);
  assert.ok(m.indexOf("checkout.sessions.expire") < m.indexOf("checkout.sessions.create"));
  assert.equal(f.llamadas.find((l) => l.metodo === "checkout.sessions.expire")!.args[0], "cs_viejo");
  assert.equal((await store.getNegocio("n1"))?.stripe?.checkoutPendiente, "cs_nuevo");
});

test("la sesión abierta se pagó justo antes de vencerla → no se crea otra", async () => {
  const f = stripeFalso({
    sesiones: { cs_viejo: { status: "open", subscription: "sub_1", customer: "cus_1" } },
    suscripciones: [subViva("active", PRECIO_P)],
    expirarFalla: true,
  });
  const store = nuevoStore(negocio({ stripe: { checkoutPendiente: "cs_viejo" } }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  assert.equal(f.metodos().includes("checkout.sessions.create"), false);
});

test("segundo checkout con el primero vencido → se crea normal", async () => {
  const f = stripeFalso({ sesiones: { cs_viejo: { status: "expired" } } });
  const store = nuevoStore(negocio({ stripe: { checkoutPendiente: "cs_viejo" } }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, depsP(store, f.cliente));
  assert.equal(r.ok, true);
  assert.equal(f.metodos().includes("checkout.sessions.expire"), false);
  assert.ok(f.metodos().includes("checkout.sessions.create"));
});

/* ---------- Portal ---------- */

test("portal: solo el dueño (403)", async () => {
  const f = stripeFalso();
  const store = nuevoStore(conStripe({ customerId: "cus_1" }));
  const r = await abrirPortal("u2", ORIGEN, { store, stripe: f.cliente });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
});

test("portal: sin customer → 400", async () => {
  const f = stripeFalso();
  const r = await abrirPortal("u1", ORIGEN, { store: nuevoStore(), stripe: f.cliente });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 400);
    assert.equal(r.error, "Todavía no tienes una suscripción con tarjeta.");
  }
});

test("portal: devuelve la URL del portal", async () => {
  const f = stripeFalso();
  const store = nuevoStore(conStripe({ customerId: "cus_1" }));
  const r = await abrirPortal("u1", ORIGEN, { store, stripe: f.cliente });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.url, "https://billing.stripe.com/p/session/bps_1");
  assert.deepEqual(f.llamadas[0].args[0], { customer: "cus_1", return_url: `${ORIGEN}/` });
});

/* ---------- Métodos nuevos del store ---------- */

test("store: modificarNegocio con eventoId marca junto con el cambio y salta repetidos", async () => {
  const s = nuevoStore();
  assert.equal(await s.modificarNegocio("n1", () => ({ nombre: "Uno" }), { eventoId: "evt_a" }), "ok");
  assert.equal(await s.modificarNegocio("n1", () => ({ nombre: "Dos" }), { eventoId: "evt_a" }), "duplicado");
  assert.equal((await s.getNegocio("n1"))?.nombre, "Uno");
  assert.equal(await s.modificarNegocio("nadie", () => ({ nombre: "X" }), { eventoId: "evt_b" }), "no_existe");
  assert.equal(s.eventoMarcado("evt_b"), false);
  await assert.rejects(
    s.modificarNegocio("n1", () => {
      throw new Error("falla");
    }, { eventoId: "evt_c" }),
  );
  assert.equal(s.eventoMarcado("evt_c"), false);
});

test("store: negocioPorCustomer", async () => {
  const s = nuevoStore(conStripe({ customerId: "cus_7" }));
  assert.equal((await s.negocioPorCustomer("cus_7"))?.id, "n1");
  assert.equal(await s.negocioPorCustomer("cus_otro"), null);
});

test("store: guardarConfig mezcla sin borrar lo demás", async () => {
  const s = memoryStore({ config: { pruebaMinutos: 20 } as Partial<PlanesConfig> });
  await s.guardarConfig({ precios: { basico: { monto: 19, stripePriceId: "p_b" } } });
  const c = await s.getConfig();
  assert.equal(c.precios.basico.stripePriceId, "p_b");
  assert.equal(c.precios.pro.monto, 39);
  assert.equal(c.pruebaMinutos, 20);
});

/* ---------- Modo de prueba y modo real (C1) ---------- */

const enModo = (ev: Stripe.Event, livemode: boolean) => ({ ...ev, livemode }) as Stripe.Event;

test("cada aviso aplicado guarda su modo (livemode)", () => {
  const c1 = aplicarEvento(evento("checkout.session.completed", sesion()), negocio(), cfg);
  assert.equal(c1?.stripe?.livemode, false);
  const c2 = aplicarEvento(enModo(evento("customer.subscription.created", suscripcion()), true), negocio(), cfg);
  assert.equal(c2?.stripe?.livemode, true);
  const n = conStripe({ subscriptionId: "sub_1", customerId: "cus_1", status: "active", livemode: true });
  const c3 = aplicarEvento(enModo(evento("invoice.paid", factura()), true), n, cfg);
  assert.equal(c3?.stripe?.livemode, true);
});

test("datos guardados del otro modo no bloquean la suscripción nueva (se empieza de cero)", () => {
  // Suscripción de prueba «activa» guardada; llega la real
  const n = conStripe({ subscriptionId: "sub_prueba", customerId: "cus_prueba", status: "active", livemode: false, ultimoEvento: (T + 999) * 1000 });
  const c = aplicarEvento(enModo(evento("customer.subscription.created", suscripcion({ id: "sub_real", customer: "cus_real" })), true), n, cfg);
  assert.ok(c);
  assert.equal(c.stripe?.subscriptionId, "sub_real");
  assert.equal(c.stripe?.customerId, "cus_real");
  assert.equal(c.stripe?.livemode, true);
  assert.equal(c.estado, "activo");
});

test("webhook: un aviso de otro modo se ignora (200) y no cambia nada", async () => {
  const store = nuevoStore();
  const { cuerpo, firma } = firmado(enModo(evento("customer.subscription.created", suscripcion()), true));
  const { r, avisos } = await callado(() => procesarWebhook(cuerpo, firma, { ...depsW(store), stripeLive: false }));
  assert.equal(r.status, 200);
  assert.equal(r.body.ignorado, true);
  assert.equal(avisos.length, 1);
  assert.equal((await store.getNegocio("n1"))?.estado, "prueba");
  // Con claves reales, el mismo aviso sí se aplica
  const r2 = await procesarWebhook(cuerpo, firma, { ...depsW(store), stripeLive: true });
  assert.equal(r2.status, 200);
  assert.equal((await store.getNegocio("n1"))?.plan, "pro");
  assert.equal((await store.getNegocio("n1"))?.stripe?.livemode, true);
});

test("pagar: suscripción y customer guardados del otro modo → checkout nuevo sin customer", async () => {
  const f = stripeFalso();
  const store = nuevoStore(conStripe({ customerId: "cus_prueba", subscriptionId: "sub_prueba", status: "active", livemode: false }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, { ...depsP(store, f.cliente), stripeLive: true });
  assert.equal(r.ok, true);
  assert.equal(f.metodos().includes("subscriptions.retrieve"), false);
  assert.equal(f.metodos().includes("subscriptions.list"), false);
  const p = f.llamadas.find((l) => l.metodo === "checkout.sessions.create")!.args[0] as Record<string, unknown>;
  assert.equal(p.customer, undefined);
  assert.equal(p.customer_email, "dueno@ejemplo.com");
});

test("pagar: datos viejos sin modo que Stripe no conoce → checkout nuevo (no 502) y quedan marcados del otro modo", async () => {
  const f = stripeFalso({ sinCliente: ["cus_viejo"] });
  const store = nuevoStore(conStripe({ customerId: "cus_viejo", subscriptionId: "sub_viejo", status: "active" }));
  const r = await pagarPlan("u1", "dueno@ejemplo.com", "pro", ORIGEN, { ...depsP(store, f.cliente), stripeLive: true });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.url, "https://checkout.stripe.com/c/pay/cs_nuevo");
  const p = f.llamadas.find((l) => l.metodo === "checkout.sessions.create")!.args[0] as Record<string, unknown>;
  assert.equal(p.customer, undefined);
  assert.equal(p.customer_email, "dueno@ejemplo.com");
  const n = await store.getNegocio("n1");
  assert.equal(n?.stripe?.livemode, false);
  assert.equal(n?.stripe?.checkoutPendiente, "cs_nuevo");
});

test("portal: customer del otro modo → 400 «Todavía no tienes una suscripción con tarjeta.»", async () => {
  const f = stripeFalso();
  const store = nuevoStore(conStripe({ customerId: "cus_prueba", livemode: false }));
  const r = await abrirPortal("u1", ORIGEN, { store, stripe: f.cliente, stripeLive: true });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 400);
    assert.equal(r.error, "Todavía no tienes una suscripción con tarjeta.");
  }
  assert.equal(f.llamadas.length, 0);
});

test("portal: Stripe no conoce el customer → 400 (no 502)", async () => {
  const f = stripeFalso({ sinCliente: ["cus_viejo"] });
  const store = nuevoStore(conStripe({ customerId: "cus_viejo" }));
  const r = await abrirPortal("u1", ORIGEN, { store, stripe: f.cliente, stripeLive: true });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 400);
    assert.equal(r.error, "Todavía no tienes una suscripción con tarjeta.");
  }
});

/* ---------- Precio → plan por lookup_key (M8) ---------- */

const conLookup = (lookup: string | undefined, precio: string) => ({
  ...suscripcion({}, precio),
  items: {
    object: "list",
    data: [{ id: "si_1", object: "subscription_item", price: { id: precio, ...(lookup ? { lookup_key: lookup } : {}) } }],
  },
});

test("plan por lookup_key primero (aunque el priceId guardado sea otro)", () => {
  const pro = aplicarEvento(evento("customer.subscription.updated", conLookup("studio_pro_mensual", "price_nuevo_pro")), negocio(), cfg);
  assert.equal(pro?.plan, "pro");
  assert.equal(pro?.stripe?.priceId, "price_nuevo_pro");
  // lookup_key de Básico manda sobre un priceId que en la configuración es de Pro
  const basico = aplicarEvento(evento("customer.subscription.updated", conLookup("studio_basico_mensual", PRECIO_P)), negocio(), cfg);
  assert.equal(basico?.plan, "basico");
});

test("sin lookup_key se usa el priceId de la configuración", () => {
  const c = aplicarEvento(evento("customer.subscription.updated", conLookup(undefined, PRECIO_P)), negocio(), cfg);
  assert.equal(c?.plan, "pro");
});

test("lookup_key desconocido y precio desconocido → Básico con aviso", async () => {
  const { r: c, avisos } = await callado(() =>
    aplicarEvento(evento("customer.subscription.updated", conLookup("otro_lookup", "price_otro")), negocio(), cfg),
  );
  assert.equal(c?.plan, "basico");
  assert.equal(avisos.length, 1);
});

/* ---------- Paquetes (pago único) ---------- */

const PRECIO_CREATIVO = "price_paq_creativo";
const PRECIO_VOZ = "price_paq_voz";
const CONFIG_PAQ: Partial<PlanesConfig> = {
  ...CONFIG,
  paquetes: {
    creativo: { ...mezclarConfig(null).paquetes.creativo, stripePriceId: PRECIO_CREATIVO },
    voz: { ...mezclarConfig(null).paquetes.voz, stripePriceId: PRECIO_VOZ },
  },
};
const storePaq = (n: Negocio, config: Partial<PlanesConfig> = CONFIG_PAQ) =>
  memoryStore({ negocios: [n], usuarios: [dueno, miembro], config });
const proActivo = (extra: Partial<Negocio> = {}) =>
  conStripe({ customerId: "cus_1", status: "active", livemode: false }, { plan: "pro", ...extra });
const comprar = (store: MemoryStore, paquete: unknown, f = stripeFalso(), uid = "u1", extra: Record<string, unknown> = {}) =>
  comprarPaquete(uid, "dueno@ejemplo.com", paquete, ORIGEN, { ...depsP(store, f.cliente), stripeLive: false, ...extra });

test("comprarPaquete: dueño Pro activo compra Voz (pago único con el cliente existente)", async () => {
  const f = stripeFalso();
  const r = await comprar(storePaq(proActivo()), "voz", f);
  assert.deepEqual(r, { ok: true, url: "https://checkout.stripe.com/c/pay/cs_nuevo" });
  const p = f.llamadas.find((l) => l.metodo === "checkout.sessions.create")!.args[0] as Record<string, unknown>;
  assert.equal(p.mode, "payment");
  assert.deepEqual(p.line_items, [{ price: PRECIO_VOZ, quantity: 1 }]);
  assert.deepEqual(p.metadata, { negocioId: "n1", paquete: "voz" });
  assert.equal(p.success_url, `${ORIGEN}/?paquete=ok`);
  assert.equal(p.cancel_url, `${ORIGEN}/?paquete=cancelado`);
  assert.equal(p.client_reference_id, "n1");
  assert.equal(p.customer, "cus_1");
  assert.equal("customer_email" in p, false);
  assert.equal("payment_method_types" in p, false);
  assert.equal("subscription_data" in p, false);
});

test("comprarPaquete: sin cliente de Stripe usa el correo; Básico puede comprar Creativo", async () => {
  const f = stripeFalso();
  const n = conStripe(undefined, { plan: "basico", origen: "manual", pagadoHasta: AHORA + DIA });
  const r = await comprar(storePaq(n), "creativo", f);
  assert.equal(r.ok, true);
  const p = f.llamadas.find((l) => l.metodo === "checkout.sessions.create")!.args[0] as Record<string, unknown>;
  assert.deepEqual(p.line_items, [{ price: PRECIO_CREATIVO, quantity: 1 }]);
  assert.equal(p.customer_email, "dueno@ejemplo.com");
  assert.equal("customer" in p, false);
  assert.equal(p.client_reference_id, "n1");
});

test("comprarPaquete: un cliente guardado del otro modo no se usa", async () => {
  const f = stripeFalso();
  const n = conStripe({ customerId: "cus_viejo", status: "active", livemode: true }, { plan: "pro" });
  // Claves de prueba: lo guardado es real, así que el negocio no tiene plan aquí
  const r = await comprar(storePaq(n), "voz", f);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
  assert.equal(f.llamadas.length, 0);
});

test("comprarPaquete: Básico no puede comprar Voz (400)", async () => {
  const f = stripeFalso();
  const r = await comprar(storePaq(conStripe({ customerId: "cus_1", status: "active", livemode: false })), "voz", f);
  assert.deepEqual(r, { ok: false, status: 400, error: "El paquete Voz es del plan Pro." });
  assert.equal(f.metodos().includes("checkout.sessions.create"), false);
});

test("comprarPaquete: pausada, en prueba o sin plan no compra (400)", async () => {
  const casos = [
    proActivo({ estado: "pausado" }),
    negocio({ estado: "prueba", pruebaHasta: AHORA + DIA }),
    negocio({ estado: "prueba", pruebaHasta: AHORA - DIA }),
    conStripe({ customerId: "cus_1", status: "past_due", livemode: false }, { plan: "pro" }),
    conStripe({ customerId: "cus_1", status: "active", livemode: false }, { plan: null }),
  ];
  for (const n of casos) {
    const f = stripeFalso();
    const r = await comprar(storePaq(n), "creativo", f);
    assert.deepEqual(r, { ok: false, status: 400, error: "Necesitas un plan activo para comprar paquetes." });
    assert.equal(f.llamadas.length, 0);
  }
});

test("comprarPaquete: un miembro (no dueño) recibe 403", async () => {
  const f = stripeFalso();
  const r = await comprar(storePaq(proActivo()), "voz", f, "u2");
  assert.deepEqual(r, { ok: false, status: 403, error: "Solo el dueño del negocio puede pagar el plan." });
  assert.equal(f.llamadas.length, 0);
});

test("comprarPaquete: paquete desconocido (400)", async () => {
  for (const x of ["otro", undefined, 5, null]) {
    const r = await comprar(storePaq(proActivo()), x);
    assert.deepEqual(r, { ok: false, status: 400, error: "Elige un paquete." });
  }
});

test("comprarPaquete: sin precio del paquete en la configuración responde 503", async () => {
  const f = stripeFalso();
  const r = await comprar(storePaq(proActivo(), CONFIG), "voz", f);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 503);
  assert.equal(f.llamadas.length, 0);
});

test("comprarPaquete: si el monto guardado no es el del precio de Stripe responde 503 (no cobra)", async () => {
  const f = stripeFalso();
  const config: Partial<PlanesConfig> = {
    ...CONFIG_PAQ,
    paquetes: { ...CONFIG_PAQ.paquetes!, creativo: { ...CONFIG_PAQ.paquetes!.creativo, monto: 6 } },
  };
  const r = await comprar(storePaq(proActivo(), config), "creativo", f);
  assert.deepEqual(r, { ok: false, status: 503, error: "Este paquete no está disponible por ahora. Avísale a InnovationTECH." });
  assert.equal(f.llamadas.length, 0);
  // El otro paquete (monto correcto) sí se puede comprar
  assert.equal((await comprar(storePaq(proActivo(), config), "voz", f)).ok, true);
});

test("comprarPaquete: si Stripe falla responde 502", async () => {
  const f = stripeFalso();
  (f.cliente as unknown as { checkout: { sessions: { create: () => Promise<never> } } }).checkout.sessions.create = async () => {
    throw new Error("boom");
  };
  const r = await comprar(storePaq(proActivo()), "voz", f);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 502);
});

test("prepararStripe: un precio de paquete con otro monto es un error (no se usa)", async () => {
  const f = stripeFalso({ precios: [{ id: "price_raro", lookup_key: "studio_paquete_voz", unit_amount: 500 }] });
  const store = memoryStore();
  const r = await prepararStripe(ADMIN, true, { store, stripe: f.cliente });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 409);
  assert.equal((await store.getConfig()).paquetes.voz.stripePriceId, undefined);
});

test("prepararStripe: un precio de paquete recurrente no sirve (409)", async () => {
  const f = stripeFalso({
    precios: [{ id: "price_rec", lookup_key: "studio_paquete_creativo", unit_amount: 500, interval: "month" }],
  });
  // El falso devuelve sin recurring los "paquete": se fuerza uno recurrente
  const original = f.cliente.prices.list;
  f.cliente.prices.list = async (p) => {
    const r = await original(p);
    return { data: r.data.map((x) => (x.lookup_key === "studio_paquete_creativo" ? { ...x, recurring: { interval: "month" } } : x)) as typeof r.data };
  };
  const r = await prepararStripe(ADMIN, true, { store: memoryStore(), stripe: f.cliente });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 409);
});
