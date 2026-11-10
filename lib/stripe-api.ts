import "server-only";
import Stripe from "stripe";
import { firestoreStore, type AccountStore, type PagoManual } from "./account-store";
import { esCorreoAdmin, type Falla } from "./account-api";
import { validarDatosActivar, type DatosActivar } from "./admin-api";
import { estadoEfectivo, esPaquete, quedaMargenParaTarjeta, type Negocio, type PaqueteId } from "./plans";
import { aplicarEvento, EVENTOS_STRIPE, idDe, LOOKUP_PAQUETES, LOOKUP_PLANES, referenciasDeEvento, SUSCRIPCION_VIVA } from "./stripe-events";
import { SIN_CONFIGURAR, stripe, stripeConfigurado, stripeModoLive } from "./stripe-server";

// Lo que hacen las rutas de Stripe (pago, portal, avisos y «Preparar Stripe»).
// Son funciones sin Request/Response para poder probarlas con un Stripe falso.

// Solo las partes de Stripe que usamos (las pruebas pasan una versión falsa).
export type ClienteStripe = {
  prices: {
    list(p: Stripe.PriceListParams): Promise<{ data: Stripe.Price[] }>;
    create(p: Stripe.PriceCreateParams): Promise<Stripe.Price>;
  };
  checkout: {
    sessions: {
      create(p: Stripe.Checkout.SessionCreateParams): Promise<{ id: string; url: string | null }>;
      retrieve(id: string): Promise<Stripe.Checkout.Session>;
      expire(id: string): Promise<Stripe.Checkout.Session>;
    };
  };
  billingPortal: { sessions: { create(p: Stripe.BillingPortal.SessionCreateParams): Promise<{ url: string }> } };
  subscriptions: {
    retrieve(id: string): Promise<Stripe.Subscription>;
    list(p: Stripe.SubscriptionListParams): Promise<{ data: Stripe.Subscription[] }>;
    update(id: string, p: Stripe.SubscriptionUpdateParams): Promise<Stripe.Subscription>;
  };
};

// stripeLive: modo de las claves (true = reales). Si no se pasa, se mira STRIPE_SECRET_KEY.
export type DepsStripe = { store?: AccountStore; stripe?: ClienteStripe; now?: number; stripeLive?: boolean };

type PlanPagado = "basico" | "pro";

const falla = (status: number, error: string, codigo?: string): Falla =>
  codigo ? { ok: false, status, error, codigo } : { ok: false, status, error };

const NO_CONFIGURADO = () => falla(503, SIN_CONFIGURAR);
const ERROR_STRIPE = () => falla(502, "No pudimos conectar con el sistema de pagos. Intenta de nuevo en un momento.");

// El cliente de Stripe: el que pasen las pruebas o el real (null si falta la clave).
function clienteDe(deps: DepsStripe): ClienteStripe | null {
  if (deps.stripe) return deps.stripe;
  return stripeConfigurado() ? stripe() : null;
}

// Solo el mensaje del error: nunca se imprime la clave ni la petición completa.
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------------- Preparar Stripe (administrador) ---------------- */

const LOOKUP = LOOKUP_PLANES;
const PRODUCTO: Record<PlanPagado, string> = { basico: "Studio Básico", pro: "Studio Pro" };
const CENTAVOS: Record<PlanPagado, number> = { basico: 1900, pro: 3900 };
const PLANES: PlanPagado[] = ["basico", "pro"];
const PAQUETES: PaqueteId[] = ["creativo", "voz"];
const PRODUCTO_PAQUETE: Record<PaqueteId, string> = { creativo: "Studio Paquete Creativo", voz: "Studio Paquete Voz", video: "Studio Paquete Video" };
const CENTAVOS_PAQUETE: Record<PaqueteId, number> = { creativo: 500, voz: 900, video: 1500 };

// Crea en Stripe (si no existen) los precios mensuales de Básico y Pro y guarda sus ids.
// Se puede pulsar varias veces: busca primero por lookup_key y solo crea lo que falta.
export async function prepararStripe(
  adminEmail: string,
  emailVerified: boolean,
  deps: DepsStripe = {},
): Promise<{ ok: true; precios: Record<PlanPagado, string>; paquetes: Record<PaqueteId, string> } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) {
    return falla(403, "No tienes permiso para el panel de administrador.", "NO_ADMIN");
  }
  const cliente = clienteDe(deps);
  if (!cliente) return NO_CONFIGURADO();
  const store = deps.store ?? firestoreStore();

  try {
    const lista = await cliente.prices.list({
      lookup_keys: [...PLANES.map((p) => LOOKUP[p]), ...PAQUETES.map((p) => LOOKUP_PAQUETES[p])],
      expand: ["data.product"],
      limit: 20,
    });
    const ids = {} as Record<PlanPagado, string>;
    for (const plan of PLANES) {
      const hay = lista.data.find((p) => p.lookup_key === LOOKUP[plan]);
      if (hay) {
        // Un precio con nuestro lookup_key pero otro monto cobraría mal: mejor avisar
        const bien =
          hay.active !== false &&
          hay.unit_amount === CENTAVOS[plan] &&
          hay.currency === "usd" &&
          hay.recurring?.interval === "month";
        if (!bien) {
          return falla(
            409,
            `En Stripe ya hay un precio «${LOOKUP[plan]}» que no es de $${CENTAVOS[plan] / 100} USD al mes (o está archivado). Revísalo en Stripe antes de continuar.`,
          );
        }
        ids[plan] = hay.id;
      } else {
        // product_data crea el producto y el precio en un solo paso
        const nuevo = await cliente.prices.create({
          currency: "usd",
          unit_amount: CENTAVOS[plan],
          recurring: { interval: "month" },
          lookup_key: LOOKUP[plan],
          product_data: { name: PRODUCTO[plan] },
        });
        ids[plan] = nuevo.id;
      }
    }
    // Paquetes: pago único (sin recurring)
    const idsPaquetes = {} as Record<PaqueteId, string>;
    for (const paq of PAQUETES) {
      const hay = lista.data.find((p) => p.lookup_key === LOOKUP_PAQUETES[paq]);
      if (hay) {
        const bien =
          hay.active !== false &&
          hay.unit_amount === CENTAVOS_PAQUETE[paq] &&
          hay.currency === "usd" &&
          !hay.recurring;
        if (!bien) {
          return falla(
            409,
            `En Stripe ya hay un precio «${LOOKUP_PAQUETES[paq]}» que no es un pago único de $${CENTAVOS_PAQUETE[paq] / 100} USD (o está archivado). Revísalo en Stripe antes de continuar.`,
          );
        }
        idsPaquetes[paq] = hay.id;
      } else {
        const nuevo = await cliente.prices.create({
          currency: "usd",
          unit_amount: CENTAVOS_PAQUETE[paq],
          lookup_key: LOOKUP_PAQUETES[paq],
          product_data: { name: PRODUCTO_PAQUETE[paq] },
        });
        idsPaquetes[paq] = nuevo.id;
      }
    }
    // Los paquetes guardan solo el id: monto, contenido y planes no se tocan
    await store.guardarConfig({
      precios: {
        basico: { monto: CENTAVOS.basico / 100, stripePriceId: ids.basico },
        pro: { monto: CENTAVOS.pro / 100, stripePriceId: ids.pro },
      },
      paquetes: {
        creativo: { stripePriceId: idsPaquetes.creativo },
        voz: { stripePriceId: idsPaquetes.voz },
      },
    });
    return { ok: true, precios: ids, paquetes: idsPaquetes };
  } catch (e) {
    console.error("Stripe: no se pudieron preparar los precios:", mensaje(e));
    return falla(502, `Stripe respondió con un error: ${mensaje(e)}`);
  }
}

/* ---------------- Pago y portal (dueño del negocio) ---------------- */

async function negocioDelDueno(store: AccountStore, uid: string): Promise<Negocio | Falla> {
  const usuario = await store.getUsuario(uid);
  const negocio = usuario ? await store.getNegocio(usuario.negocioId) : null;
  if (!negocio) return falla(404, "Primero crea tu negocio.");
  if (negocio.duenoUid !== uid) return falla(403, "Solo el dueño del negocio puede pagar el plan.");
  return negocio;
}
const esFalla = (v: Negocio | Falla): v is Falla => (v as Falla).ok === false;

const fechaLarga = (ms: number) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "America/Chicago", day: "numeric", month: "long", year: "numeric" }).format(ms);
// «8 de diciembre» (sin año)
const fechaCorta = (ms: number) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "America/Chicago", day: "numeric", month: "long" }).format(ms);

const noExiste = (e: unknown) => {
  const x = e as { code?: unknown; statusCode?: unknown };
  return x?.code === "resource_missing" || x?.statusCode === 404;
};

const SIN_SUSCRIPCION = "Todavía no tienes una suscripción con tarjeta.";

// ¿Lo guardado de Stripe es del otro modo (prueba ↔ real)? Entonces sus ids no existen aquí.
const deOtroModo = (n: Negocio, live: boolean) => n.stripe?.livemode !== undefined && n.stripe.livemode !== live;

// El negocio con solo lo de Stripe que sirve en este modo: si es del otro modo, se trata como
// «sin cliente» (solo queda la sesión pendiente, que sí es de este modo).
function vistaDelModo(n: Negocio, live: boolean): Negocio {
  if (!deOtroModo(n, live)) return n;
  const pendiente = n.stripe?.checkoutPendiente;
  return { ...n, stripe: pendiente ? { checkoutPendiente: pendiente } : undefined };
}

// La suscripción del negocio que todavía puede cobrar, preguntándole a Stripe (no a nuestra base,
// que puede ir unos segundos atrasada). Así nunca se abre una segunda suscripción encima.
// `ajeno`: Stripe no conoce el cliente guardado (datos viejos del otro modo): hay que empezar de cero.
async function suscripcionViva(
  cliente: ClienteStripe,
  n: Negocio,
): Promise<{ viva: Stripe.Subscription | null; ajeno: boolean }> {
  const s = n.stripe;
  let subFalta = false;
  if (s?.subscriptionId) {
    try {
      const sub = await cliente.subscriptions.retrieve(s.subscriptionId);
      if (SUSCRIPCION_VIVA.has(sub.status)) return { viva: sub, ajeno: false };
    } catch (e) {
      if (!noExiste(e)) throw e;
      subFalta = true;
    }
  }
  if (s?.customerId) {
    try {
      const lista = await cliente.subscriptions.list({ customer: s.customerId, status: "all", limit: 20 });
      return { viva: lista.data.find((x) => SUSCRIPCION_VIVA.has(x.status)) ?? null, ajeno: false };
    } catch (e) {
      if (!noExiste(e)) throw e;
      return { viva: null, ajeno: true };
    }
  }
  return { viva: null, ajeno: subFalta };
}

// La sesión de pago que quedó pendiente (la última que abrimos para este negocio):
//  - pagada (complete): devuelve su suscripción si sigue viva, para no abrir otra encima;
//  - abierta (open): la vence (expire) para que no se pueda pagar junto con la nueva;
//  - vencida o inexistente: nada.
async function revisarPendiente(cliente: ClienteStripe, id: string): Promise<Stripe.Subscription | null> {
  let ses: Stripe.Checkout.Session;
  try {
    ses = await cliente.checkout.sessions.retrieve(id);
  } catch (e) {
    if (noExiste(e)) return null;
    throw e;
  }
  if (ses.status === "open") {
    try {
      await cliente.checkout.sessions.expire(id);
      return null;
    } catch (e) {
      // Puede que la hayan pagado justo ahora: se vuelve a mirar
      ses = await cliente.checkout.sessions.retrieve(id);
      if (ses.status === "expired") return null;
      if (ses.status !== "complete") throw e;
    }
  }
  if (ses.status !== "complete") return null;
  const subId = idDe(ses.subscription);
  if (!subId) return null;
  const sub = await cliente.subscriptions.retrieve(subId);
  return SUSCRIPCION_VIVA.has(sub.status) ? sub : null;
}

// Ya hay una suscripción que cobra: cambiar de plan en ella o mandar al portal (nunca otra nueva).
async function usarSuscripcion(
  cliente: ClienteStripe,
  viva: Stripe.Subscription,
  negocio: Negocio,
  priceId: string,
  origin: string,
): Promise<{ ok: true; url: string } | Falla> {
  const customer = idDe(viva.customer) ?? negocio.stripe?.customerId;
  const item = viva.items?.data?.[0];
  const alDia = viva.status === "active" || viva.status === "trialing";
  if (alDia && item && item.price?.id !== priceId) {
    await cliente.subscriptions.update(viva.id, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: "create_prorations",
    });
    // El plan nuevo llega por el aviso customer.subscription.updated
    return { ok: true, url: `${origin}/?pago=ok` };
  }
  if (!customer) return ERROR_STRIPE();
  return { ok: true, url: (await portal(cliente, customer, origin)).url };
}

function portal(cliente: ClienteStripe, customer: string, origin: string) {
  return cliente.billingPortal.sessions.create({ customer, return_url: `${origin}/` });
}

// Arma la sesión de pago de Stripe (Checkout) para una suscripción nueva.
// Sin payment_method_types: los métodos salen de la configuración de Stripe (así se puede
// encender Cash App Pay desde el panel de Stripe sin tocar código).
// trialEnd (segundos): el primer cobro se hace ese día (al pasar de pago a mano a tarjeta).
export function crearCheckout(
  cliente: ClienteStripe,
  negocio: Negocio,
  email: string,
  priceId: string,
  origin: string,
  opciones: { trialEnd?: number } = {},
) {
  const customer = negocio.stripe?.customerId;
  const correo = email.trim();
  const { trialEnd } = opciones;
  return cliente.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: negocio.id,
    ...(customer ? { customer } : correo ? { customer_email: correo } : {}),
    success_url: `${origin}/?pago=ok`,
    cancel_url: `${origin}/?pago=cancelado`,
    metadata: { negocioId: negocio.id },
    subscription_data: {
      metadata: { negocioId: negocio.id },
      ...(trialEnd !== undefined ? { trial_end: trialEnd } : {}),
    },
  });
}

// Pagado en efectivo y vigente (sin suscripción que cobre): solo el mismo plan y sin cobrar hoy.
// Devuelve el trial_end (segundos) para el Checkout, o la falla que hay que mostrar.
function reglaEfectivo(negocio: Negocio, plan: PlanPagado, hasta: number, ahora: number): number | Falla {
  if (negocio.estado === "pausado") {
    // Pausado a mano: lo decide el equipo, no se cambia desde aquí
    return falla(400, `Tu plan está pagado a mano hasta ${fechaLarga(hasta)}. Escríbenos si quieres pasarte a tarjeta.`);
  }
  if (plan !== negocio.plan) {
    return falla(400, `Tu plan está pagado a mano hasta ${fechaLarga(hasta)}. Para cambiar de plan, escríbenos.`);
  }
  if (!quedaMargenParaTarjeta(hasta, ahora)) {
    return falla(400, `Tu plan está pagado a mano hasta el ${fechaCorta(hasta)}. Ese día podrás poner tu tarjeta.`);
  }
  return Math.floor(hasta / 1000);
}

// Cambiar de plan en una suscripción viva no se hace aquí si lo pagado a mano sigue en juego:
//  - en la prueba que cubre lo pagado a mano (camino A) el cambio saldría gratis hasta esa fecha;
//  - con un pago a mano pendiente (camino B) el plan ya quedó acordado con el equipo.
// Devuelve la falla que hay que mostrar, o null si se puede seguir.
function cambioDePlanBloqueado(viva: Stripe.Subscription, negocio: Negocio, priceId: string, ahora: number): Falla | null {
  const item = viva.items?.data?.[0];
  if (!item || item.price?.id === priceId) return null;
  const hasta = negocio.pagadoHasta;
  if (viva.status === "trialing" && hasta !== undefined && hasta > ahora) {
    return falla(400, `Tu plan está pagado a mano hasta ${fechaLarga(hasta)}. Para cambiar de plan, escríbenos.`);
  }
  const siguiente = negocio.manualSiguiente;
  if (siguiente) {
    const finSeg = item.current_period_end;
    const fin = typeof finSeg === "number" ? finSeg * 1000 : negocio.stripe?.finPeriodo;
    return falla(
      400,
      fin !== undefined
        ? `Este negocio pasará a pago a mano el ${fechaCorta(fin)}. Para cambiar de plan, escríbenos.`
        : `Tu plan está pagado a mano hasta ${fechaLarga(siguiente.hasta)}. Para cambiar de plan, escríbenos.`,
    );
  }
  return null;
}

// «Elegir Básico / Pro»: devuelve la URL a donde mandar al dueño.
//  - Sin suscripción viva: Checkout nuevo.
//  - Con suscripción al día y otro plan: se cambia esa misma suscripción (con prorrateo).
//  - Con el mismo plan o con un pago pendiente: portal de Stripe (actualizar tarjeta o pagar).
//  - Pagado en efectivo y vigente sin suscripción viva (pago a mano, o pasó a tarjeta y canceló):
//    solo el mismo plan, con ≥ 48 h de margen; Checkout con prueba (trial_end) hasta que vence
//    lo pagado, así no se cobran días ya pagados.
//  - En la prueba que cubre lo pagado a mano, o con un pago a mano pendiente: no cambia de plan
//    (400 «Para cambiar de plan, escríbenos.»).
export async function pagarPlan(
  uid: string,
  email: string,
  plan: unknown,
  origin: string,
  deps: DepsStripe = {},
): Promise<{ ok: true; url: string } | Falla> {
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const live = deps.stripeLive ?? stripeModoLive();
  const guardado = await negocioDelDueno(store, uid);
  if (esFalla(guardado)) return guardado;
  if (plan !== "basico" && plan !== "pro") return falla(400, "Elige Básico o Pro.");
  // Lo de Stripe del otro modo no se usa (ni su cliente ni su suscripción)
  let negocio = vistaDelModo(guardado, live);
  const cliente = clienteDe(deps);
  if (!cliente) return NO_CONFIGURADO();
  const cfg = await store.getConfig();
  const priceId = cfg.precios[plan].stripePriceId;
  if (!priceId) return NO_CONFIGURADO();
  // Lo pagado en efectivo que sigue vigente: la suscripción nueva empieza en prueba y el primer
  // cobro es cuando vence (así no se cobra dos veces). Con pago a mano se revisa antes de ir a
  // Stripe; si ya pasó a tarjeta, después de confirmar con Stripe que no hay una suscripción viva.
  const hasta = negocio.pagadoHasta !== undefined && negocio.pagadoHasta > ahora ? negocio.pagadoHasta : undefined;
  let trialEnd: number | undefined;
  if (hasta !== undefined && negocio.origen === "manual") {
    const r = reglaEfectivo(negocio, plan, hasta, ahora);
    if (typeof r !== "number") return r;
    trialEnd = r;
  }

  try {
    const { viva, ajeno } = await suscripcionViva(cliente, negocio);
    if (viva) return cambioDePlanBloqueado(viva, negocio, priceId, ahora) ?? (await usarSuscripcion(cliente, viva, negocio, priceId, origin));
    // Stripe no conoce lo guardado (datos viejos de otro modo, sin marca): se sigue como cliente nuevo
    // y se marca como del otro modo para que ya no cuente (ni dé plan) en este.
    const marcarAjeno = ajeno && negocio.stripe?.livemode === undefined;
    if (ajeno) {
      const pendiente = negocio.stripe?.checkoutPendiente;
      negocio = { ...negocio, stripe: pendiente ? { checkoutPendiente: pendiente } : undefined };
    }

    // ¿Quedó una sesión de pago de antes? (pagada pero sin aviso todavía, o abierta en otra pestaña)
    const pendiente = negocio.stripe?.checkoutPendiente;
    if (pendiente) {
      const deSesion = await revisarPendiente(cliente, pendiente);
      if (deSesion) {
        return cambioDePlanBloqueado(deSesion, negocio, priceId, ahora) ?? (await usarSuscripcion(cliente, deSesion, negocio, priceId, origin));
      }
    }

    // Pasó a tarjeta y la suscripción ya no sigue (p. ej. canceló la prueba): el efectivo sigue cubriendo
    if (hasta !== undefined && negocio.origen === "stripe") {
      const r = reglaEfectivo(negocio, plan, hasta, ahora);
      if (typeof r !== "number") return r;
      trialEnd = r;
    }

    const sesion = await crearCheckout(cliente, negocio, email, priceId, origin, { trialEnd });
    if (!sesion.url) return ERROR_STRIPE();
    // Se guarda como pendiente para revisarla si vuelven a pulsar «Elegir»
    let otra: string | undefined;
    await store.modificarNegocio(negocio.id, (n) => {
      otra = n.stripe?.checkoutPendiente;
      return {
        stripe: {
          ...n.stripe,
          checkoutPendiente: sesion.id,
          ...(marcarAjeno && n.stripe?.livemode === undefined ? { livemode: !live } : {}),
        },
      };
    });
    // Si otra pestaña abrió una sesión mientras tanto, se vence para que no se paguen las dos
    if (otra && otra !== pendiente && otra !== sesion.id) {
      try {
        await cliente.checkout.sessions.expire(otra);
      } catch (e) {
        console.warn(`Stripe: no se pudo vencer la sesión de pago ${otra}:`, mensaje(e));
      }
    }
    return { ok: true, url: sesion.url };
  } catch (e) {
    console.error("Stripe: no se pudo iniciar el pago:", mensaje(e));
    return ERROR_STRIPE();
  }
}

// «Comprar paquete»: pago único con tarjeta. Solo para el dueño de un negocio con plan activo
// (también si paga a mano: es un cobro aparte, no hay riesgo de cobrar dos veces).
export async function comprarPaquete(
  uid: string,
  email: string,
  paquete: unknown,
  origin: string,
  deps: DepsStripe = {},
): Promise<{ ok: true; url: string } | Falla> {
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const live = deps.stripeLive ?? stripeModoLive();
  const guardado = await negocioDelDueno(store, uid);
  if (esFalla(guardado)) return guardado;
  if (!esPaquete(paquete)) return falla(400, "Elige un paquete.");
  const negocio = vistaDelModo(guardado, live);
  const cliente = clienteDe(deps);
  if (!cliente) return NO_CONFIGURADO();
  const efectivo = estadoEfectivo(guardado, ahora, { stripeLive: live });
  if (efectivo.estado !== "activo" || (efectivo.plan !== "basico" && efectivo.plan !== "pro")) {
    return falla(400, "Necesitas un plan activo para comprar paquetes.");
  }
  const cfg = await store.getConfig();
  const conf = cfg.paquetes[paquete];
  if (!conf.planes.includes(efectivo.plan)) {
    return falla(400, paquete === "voz" ? "El paquete Voz es del plan Pro." : "Este paquete no está disponible en tu plan.");
  }
  if (!conf.stripePriceId) return NO_CONFIGURADO();
  // El aviso de Stripe solo acredita si el pago es igual al monto guardado: si alguien cambió
  // el monto (y no el precio de Stripe), se cobraría sin acreditar. Mejor no cobrar.
  if (Math.round(conf.monto * 100) !== CENTAVOS_PAQUETE[paquete]) {
    return falla(503, "Este paquete no está disponible por ahora. Avísale a InnovationTECH.");
  }

  try {
    const customer = negocio.stripe?.customerId;
    const correo = email.trim();
    const sesion = await cliente.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: conf.stripePriceId, quantity: 1 }],
      client_reference_id: negocio.id,
      ...(customer ? { customer } : correo ? { customer_email: correo } : {}),
      success_url: `${origin}/?paquete=ok`,
      cancel_url: `${origin}/?paquete=cancelado`,
      metadata: { negocioId: negocio.id, paquete },
    });
    if (!sesion.url) return ERROR_STRIPE();
    return { ok: true, url: sesion.url };
  } catch (e) {
    console.error("Stripe: no se pudo iniciar la compra del paquete:", mensaje(e));
    return ERROR_STRIPE();
  }
}

// «Administrar suscripción» / «Pagar para reactivar»: portal de clientes de Stripe.
export async function abrirPortal(
  uid: string,
  origin: string,
  deps: DepsStripe = {},
): Promise<{ ok: true; url: string } | Falla> {
  const store = deps.store ?? firestoreStore();
  const live = deps.stripeLive ?? stripeModoLive();
  const negocio = await negocioDelDueno(store, uid);
  if (esFalla(negocio)) return negocio;
  const cliente = clienteDe(deps);
  if (!cliente) return NO_CONFIGURADO();
  // Un cliente del otro modo (prueba ↔ real) no existe aquí: es como no tener suscripción
  const customer = vistaDelModo(negocio, live).stripe?.customerId;
  if (!customer) return falla(400, SIN_SUSCRIPCION);
  try {
    return { ok: true, url: (await portal(cliente, customer, origin)).url };
  } catch (e) {
    if (noExiste(e)) return falla(400, SIN_SUSCRIPCION);
    console.error("Stripe: no se pudo abrir el portal:", mensaje(e));
    return ERROR_STRIPE();
  }
}

/* ---------------- De tarjeta a pago a mano (administrador) ---------------- */

const SIN_TARJETA_AL_DIA = "Este negocio no tiene una suscripción con tarjeta al día.";
const YA_PENDIENTE = "Este negocio ya tiene un pago a mano pendiente.";
const NO_SE_GUARDO_MANUAL =
  "La tarjeta ya no volverá a cobrar, pero no se pudo guardar el pago a mano. Vuelve a intentarlo o anótalo en el historial.";
const NO_NEGOCIO_ADMIN = () => falla(404, "No encontramos ese negocio.");

// «Pasar a pago a mano»: el cliente paga con tarjeta y ahora pagará a mano.
// No se cobra dos veces ni se pausa: la suscripción se cancela al final del mes ya pagado con
// tarjeta (cancel_at_period_end) y el pago a mano queda pendiente (manualSiguiente). Cuando Stripe
// avise que la suscripción terminó (customer.subscription.deleted), el webhook lo pasa a pago a mano.
// La fecha «hasta» debe ser después de ese fin de mes. Si Stripe falla no se guarda nada.
export async function pasarAManual(
  adminEmail: string,
  emailVerified: boolean,
  negocioId: string,
  datos: DatosActivar,
  deps: DepsStripe = {},
): Promise<{ ok: true; finTarjeta: number } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) {
    return falla(403, "No tienes permiso para el panel de administrador.", "NO_ADMIN");
  }
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const live = deps.stripeLive ?? stripeModoLive();
  const invalido = validarDatosActivar(datos, ahora);
  if (invalido) return invalido;

  const guardado = await store.getNegocio(negocioId);
  if (!guardado) return NO_NEGOCIO_ADMIN();
  const nota = typeof datos.nota === "string" ? datos.nota.trim().slice(0, 300) : "";
  const pago: PagoManual = {
    id: crypto.randomUUID(),
    negocioId,
    plan: datos.plan,
    monto: datos.monto,
    metodo: datos.metodo,
    hasta: datos.hasta,
    ...(nota ? { nota } : {}),
    registradoPor: adminEmail.trim().toLowerCase(),
    fecha: ahora,
  };
  const noSeGuardo = (subId: string | undefined, e: unknown) => {
    console.error(
      `Stripe: la suscripción ${subId ?? "(sin id)"} del negocio ${negocioId} ya no volverá a cobrar, pero no se pudo ` +
        `guardar el pago a mano (plan ${datos.plan}, hasta ${datos.hasta}, monto ${datos.monto}):`,
      mensaje(e),
    );
    return falla(500, NO_SE_GUARDO_MANUAL);
  };

  // Ya hay un pago a mano pendiente (doble clic o reintento): no se registra otro.
  // Única excepción: un reintento con el mismo plan y fecha cuando el pendiente se guardó pero el
  // pago no (falló al anotarlo). Entonces solo se anota el pago, sin volver a Stripe.
  const previo = guardado.manualSiguiente;
  if (previo) {
    const mismo = previo.plan === datos.plan && previo.hasta === datos.hasta;
    const finGuardado = guardado.stripe?.finPeriodo;
    if (!mismo || finGuardado === undefined) return falla(400, YA_PENDIENTE);
    const pagos = await store.listarPagosManuales(negocioId);
    if (pagos.some((p) => p.plan === datos.plan && p.hasta === datos.hasta)) return falla(400, YA_PENDIENTE);
    try {
      await store.registrarPagoManual(pago);
    } catch (e) {
      return noSeGuardo(guardado.stripe?.subscriptionId, e);
    }
    return { ok: true, finTarjeta: finGuardado };
  }

  const cliente = clienteDe(deps);
  if (!cliente) return NO_CONFIGURADO();
  // Solo una suscripción de tarjeta de este modo de Stripe (la del otro modo no cobra aquí)
  const negocio = vistaDelModo(guardado, live);
  const subId = negocio.origen === "stripe" ? negocio.stripe?.subscriptionId : undefined;
  if (!subId) return falla(400, SIN_TARJETA_AL_DIA);

  let finTarjeta: number;
  try {
    let sub: Stripe.Subscription;
    try {
      sub = await cliente.subscriptions.retrieve(subId);
    } catch (e) {
      if (noExiste(e)) return falla(400, SIN_TARJETA_AL_DIA);
      throw e;
    }
    // Solo al día de verdad: en prueba (trialing) o con un pago pendiente no hay «mes pagado»
    if (sub.status !== "active") return falla(400, SIN_TARJETA_AL_DIA);
    const fin = sub.items?.data?.[0]?.current_period_end;
    if (typeof fin !== "number") {
      console.error(`Stripe: la suscripción ${subId} no trae el fin del periodo; no se pasa a pago a mano.`);
      return ERROR_STRIPE();
    }
    finTarjeta = fin * 1000;
    if (datos.hasta <= finTarjeta) {
      return falla(400, `La fecha debe ser después del ${fechaCorta(finTarjeta)}, cuando termina el mes pagado con tarjeta.`);
    }
    // Deja de cobrar al final del mes ya pagado (no cancela hoy: el cliente sigue con su plan).
    // Repetirlo no hace daño (otra llamada a la vez deja lo mismo).
    await cliente.subscriptions.update(subId, { cancel_at_period_end: true });
  } catch (e) {
    console.error("Stripe: no se pudo pasar a pago a mano:", mensaje(e));
    return ERROR_STRIPE();
  }

  // Primero el pendiente (lo que el webhook necesita) y después el registro del pago.
  // Se revisa otra vez dentro de la transacción: si otra llamada lo guardó antes, esta no registra nada.
  try {
    let yaHabia = false;
    const r = await store.modificarNegocio(negocioId, (n) => {
      yaHabia = !!n.manualSiguiente; // se asigna en cada vuelta: Firestore puede repetir la transacción
      if (yaHabia) return null;
      return {
        manualSiguiente: { plan: datos.plan, hasta: datos.hasta },
        stripe: { ...n.stripe, finPeriodo: finTarjeta },
        actualizado: ahora,
      };
    });
    if (r === "no_existe") return NO_NEGOCIO_ADMIN();
    if (yaHabia) return falla(400, YA_PENDIENTE);
    await store.registrarPagoManual(pago);
  } catch (e) {
    return noSeGuardo(subId, e);
  }
  return { ok: true, finTarjeta };
}

/* ---------------- Avisos de Stripe (webhook) ---------------- */

export type DepsWebhook = {
  store?: AccountStore;
  secreto?: string; // STRIPE_WEBHOOK_SECRET
  now?: number;
  stripeLive?: boolean; // modo de las claves (si no se pasa, se mira STRIPE_SECRET_KEY)
  webhooks?: Pick<Stripe.Webhooks, "constructEvent">;
};

type RespuestaWebhook = { status: number; body: Record<string, unknown> };
const MANEJADOS = new Set<string>(EVENTOS_STRIPE);

export async function procesarWebhook(
  cuerpo: string,
  firma: string | null,
  deps: DepsWebhook = {},
): Promise<RespuestaWebhook> {
  const secreto = deps.secreto ?? process.env.STRIPE_WEBHOOK_SECRET;
  if (!secreto) return { status: 503, body: { error: SIN_CONFIGURAR } };
  if (!firma) return { status: 400, body: { error: "Falta la firma de Stripe." } };

  // 1) La firma prueba que el aviso viene de Stripe (si no, se rechaza)
  let evento: Stripe.Event;
  try {
    evento = (deps.webhooks ?? Stripe.webhooks).constructEvent(cuerpo, firma, secreto);
  } catch {
    return { status: 400, body: { error: "Firma inválida." } };
  }
  if (!MANEJADOS.has(evento.type)) return { status: 200, body: { recibido: true } };

  // Un aviso del otro modo (prueba ↔ real) no se aplica: una tarjeta de prueba nunca da un plan real
  const live = deps.stripeLive ?? stripeModoLive();
  if (evento.livemode !== live) {
    console.warn(
      `Stripe: aviso ${evento.id} (${evento.type}) es del modo ${evento.livemode ? "real" : "de prueba"} y las claves son del otro; se ignora.`,
    );
    return { status: 200, body: { recibido: true, ignorado: true } };
  }

  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();

  // 2) ¿De qué negocio es? (ids que pusimos nosotros y, si no, el cliente de Stripe)
  const refs = referenciasDeEvento(evento);
  let negocio: Negocio | null = null;
  for (const id of refs.negocioIds) {
    negocio = await store.getNegocio(id);
    if (negocio) break;
  }
  if (!negocio && refs.customerId) negocio = await store.negocioPorCustomer(refs.customerId);
  if (!negocio) {
    console.warn(`Stripe: aviso ${evento.id} (${evento.type}) sin negocio conocido; se ignora.`);
    return { status: 200, body: { recibido: true } };
  }

  // 3) Aplicar. La marca de «ya procesado» se guarda en la misma transacción que el cambio:
  //    un aviso repetido se salta, y si algo falla no queda marca y el reintento de Stripe sí se aplica.
  try {
    const cfg = await store.getConfig();
    let ignorado = null as Negocio | null;
    const r = await store.modificarNegocio(
      negocio.id,
      (n) => {
        const cambios = aplicarEvento(evento, n, cfg);
        if (!cambios) {
          ignorado = n;
          return null;
        }
        return { ...cambios, actualizado: ahora };
      },
      { eventoId: evento.id },
    );
    if (r === "duplicado") return { status: 200, body: { recibido: true, duplicado: true } };
    if (ignorado) avisarSiDobleSuscripcion(evento, ignorado);
    return { status: 200, body: { recibido: true } };
  } catch (e) {
    console.error(`Stripe: no se pudo aplicar el aviso ${evento.id} (${evento.type}):`, mensaje(e));
    return { status: 500, body: { error: "No se pudo procesar el aviso." } };
  }
}

// Si llega otra suscripción mientras la actual sigue cobrando, se deja en el registro para revisarla.
function avisarSiDobleSuscripcion(evento: Stripe.Event, n: Negocio) {
  const o = evento.data.object as unknown as Record<string, unknown>;
  const sub = evento.type === "checkout.session.completed" ? idDe(o.subscription as string) : evento.type.startsWith("customer.subscription.") ? (o.id as string) : undefined;
  const actual = n.stripe?.subscriptionId;
  if (sub && actual && sub !== actual && SUSCRIPCION_VIVA.has(n.stripe?.status ?? "") && evento.type !== "customer.subscription.deleted") {
    console.warn(
      `Stripe: el negocio ${n.id} ya tiene la suscripción ${actual} y llegó otra (${sub}). Revisa en Stripe que no se cobre dos veces.`,
    );
  }
}
