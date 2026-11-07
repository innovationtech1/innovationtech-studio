import "server-only";
import Stripe from "stripe";
import { firestoreStore, type AccountStore } from "./account-store";
import { esCorreoAdmin, type Falla } from "./account-api";
import type { Negocio } from "./plans";
import { aplicarEvento, EVENTOS_STRIPE, idDe, referenciasDeEvento, SUSCRIPCION_VIVA } from "./stripe-events";
import { SIN_CONFIGURAR, stripe, stripeConfigurado } from "./stripe-server";

// Lo que hacen las rutas de Stripe (pago, portal, avisos y «Preparar Stripe»).
// Son funciones sin Request/Response para poder probarlas con un Stripe falso.

// Solo las partes de Stripe que usamos (las pruebas pasan una versión falsa).
export type ClienteStripe = {
  prices: {
    list(p: Stripe.PriceListParams): Promise<{ data: Stripe.Price[] }>;
    create(p: Stripe.PriceCreateParams): Promise<Stripe.Price>;
  };
  checkout: { sessions: { create(p: Stripe.Checkout.SessionCreateParams): Promise<{ url: string | null }> } };
  billingPortal: { sessions: { create(p: Stripe.BillingPortal.SessionCreateParams): Promise<{ url: string }> } };
  subscriptions: {
    retrieve(id: string): Promise<Stripe.Subscription>;
    list(p: Stripe.SubscriptionListParams): Promise<{ data: Stripe.Subscription[] }>;
    update(id: string, p: Stripe.SubscriptionUpdateParams): Promise<Stripe.Subscription>;
  };
};

export type DepsStripe = { store?: AccountStore; stripe?: ClienteStripe; now?: number };

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

const LOOKUP: Record<PlanPagado, string> = { basico: "studio_basico_mensual", pro: "studio_pro_mensual" };
const PRODUCTO: Record<PlanPagado, string> = { basico: "Studio Básico", pro: "Studio Pro" };
const CENTAVOS: Record<PlanPagado, number> = { basico: 1900, pro: 3900 };
const PLANES: PlanPagado[] = ["basico", "pro"];

// Crea en Stripe (si no existen) los precios mensuales de Básico y Pro y guarda sus ids.
// Se puede pulsar varias veces: busca primero por lookup_key y solo crea lo que falta.
export async function prepararStripe(
  adminEmail: string,
  emailVerified: boolean,
  deps: DepsStripe = {},
): Promise<{ ok: true; precios: Record<PlanPagado, string> } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) {
    return falla(403, "No tienes permiso para el panel de administrador.", "NO_ADMIN");
  }
  const cliente = clienteDe(deps);
  if (!cliente) return NO_CONFIGURADO();
  const store = deps.store ?? firestoreStore();

  try {
    const lista = await cliente.prices.list({
      lookup_keys: PLANES.map((p) => LOOKUP[p]),
      expand: ["data.product"],
      limit: 10,
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
    await store.guardarConfig({
      precios: {
        basico: { monto: CENTAVOS.basico / 100, stripePriceId: ids.basico },
        pro: { monto: CENTAVOS.pro / 100, stripePriceId: ids.pro },
      },
    });
    return { ok: true, precios: ids };
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

const noExiste = (e: unknown) => {
  const x = e as { code?: unknown; statusCode?: unknown };
  return x?.code === "resource_missing" || x?.statusCode === 404;
};

// La suscripción del negocio que todavía puede cobrar, preguntándole a Stripe (no a nuestra base,
// que puede ir unos segundos atrasada). Así nunca se abre una segunda suscripción encima.
async function suscripcionViva(cliente: ClienteStripe, n: Negocio): Promise<Stripe.Subscription | null> {
  const s = n.stripe;
  if (s?.subscriptionId) {
    try {
      const sub = await cliente.subscriptions.retrieve(s.subscriptionId);
      if (SUSCRIPCION_VIVA.has(sub.status)) return sub;
    } catch (e) {
      if (!noExiste(e)) throw e;
    }
  }
  if (s?.customerId) {
    const lista = await cliente.subscriptions.list({ customer: s.customerId, status: "all", limit: 20 });
    return lista.data.find((x) => SUSCRIPCION_VIVA.has(x.status)) ?? null;
  }
  return null;
}

function portal(cliente: ClienteStripe, customer: string, origin: string) {
  return cliente.billingPortal.sessions.create({ customer, return_url: `${origin}/` });
}

// Arma la sesión de pago de Stripe (Checkout) para una suscripción nueva.
// Sin payment_method_types: los métodos salen de la configuración de Stripe (así se puede
// encender Cash App Pay desde el panel de Stripe sin tocar código).
export function crearCheckout(cliente: ClienteStripe, negocio: Negocio, email: string, priceId: string, origin: string) {
  const customer = negocio.stripe?.customerId;
  const correo = email.trim();
  return cliente.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: negocio.id,
    ...(customer ? { customer } : correo ? { customer_email: correo } : {}),
    success_url: `${origin}/?pago=ok`,
    cancel_url: `${origin}/?pago=cancelado`,
    metadata: { negocioId: negocio.id },
    subscription_data: { metadata: { negocioId: negocio.id } },
  });
}

// «Elegir Básico / Pro»: devuelve la URL a donde mandar al dueño.
//  - Sin suscripción viva: Checkout nuevo.
//  - Con suscripción al día y otro plan: se cambia esa misma suscripción (con prorrateo).
//  - Con el mismo plan o con un pago pendiente: portal de Stripe (actualizar tarjeta o pagar).
export async function pagarPlan(
  uid: string,
  email: string,
  plan: unknown,
  origin: string,
  deps: DepsStripe = {},
): Promise<{ ok: true; url: string } | Falla> {
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const negocio = await negocioDelDueno(store, uid);
  if (esFalla(negocio)) return negocio;
  if (plan !== "basico" && plan !== "pro") return falla(400, "Elige Básico o Pro.");
  const cliente = clienteDe(deps);
  if (!cliente) return NO_CONFIGURADO();
  const cfg = await store.getConfig();
  const priceId = cfg.precios[plan].stripePriceId;
  if (!priceId) return NO_CONFIGURADO();
  // Pagado a mano y vigente: pagar con tarjeta ahora sería cobrar dos veces
  if (negocio.origen === "manual" && negocio.pagadoHasta !== undefined && negocio.pagadoHasta > ahora) {
    return falla(
      400,
      `Tu plan está pagado a mano hasta ${fechaLarga(negocio.pagadoHasta)}. Escríbenos si quieres pasarte a tarjeta.`,
    );
  }

  try {
    const viva = await suscripcionViva(cliente, negocio);
    if (viva) {
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

    const sesion = await crearCheckout(cliente, negocio, email, priceId, origin);
    if (!sesion.url) return ERROR_STRIPE();
    return { ok: true, url: sesion.url };
  } catch (e) {
    console.error("Stripe: no se pudo iniciar el pago:", mensaje(e));
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
  const negocio = await negocioDelDueno(store, uid);
  if (esFalla(negocio)) return negocio;
  const cliente = clienteDe(deps);
  if (!cliente) return NO_CONFIGURADO();
  const customer = negocio.stripe?.customerId;
  if (!customer) return falla(400, "Todavía no tienes una suscripción con tarjeta.");
  try {
    return { ok: true, url: (await portal(cliente, customer, origin)).url };
  } catch (e) {
    console.error("Stripe: no se pudo abrir el portal:", mensaje(e));
    return ERROR_STRIPE();
  }
}

/* ---------------- Avisos de Stripe (webhook) ---------------- */

export type DepsWebhook = {
  store?: AccountStore;
  secreto?: string; // STRIPE_WEBHOOK_SECRET
  now?: number;
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

  // 3) Cada aviso se aplica una sola vez (Stripe a veces lo manda repetido)
  if (await store.eventoProcesado(evento.id)) return { status: 200, body: { recibido: true, duplicado: true } };

  // 4) Aplicar. Si falla, se quita la marca y se responde 500 para que Stripe lo reintente
  try {
    const cfg = await store.getConfig();
    let ignorado = null as Negocio | null;
    await store.modificarNegocio(negocio.id, (n) => {
      const cambios = aplicarEvento(evento, n, cfg);
      if (!cambios) {
        ignorado = n;
        return null;
      }
      return { ...cambios, actualizado: ahora };
    });
    if (ignorado) avisarSiDobleSuscripcion(evento, ignorado);
    return { status: 200, body: { recibido: true } };
  } catch (e) {
    console.error(`Stripe: no se pudo aplicar el aviso ${evento.id} (${evento.type}):`, mensaje(e));
    try {
      await store.olvidarEvento(evento.id);
    } catch (e2) {
      console.error(`Stripe: tampoco se pudo quitar la marca del aviso ${evento.id}:`, mensaje(e2));
    }
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
