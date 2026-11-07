import type Stripe from "stripe";
import type { Negocio, PlanesConfig } from "./plans";

// Qué le pasa a un negocio cuando llega un aviso (evento) de Stripe.
// Todo aquí es "puro": no lee ni guarda nada, solo calcula. Así se puede probar sin Stripe.
//
// Versión de la API de Stripe: 2026-10-28.endive (la del paquete stripe 23.1.0).
// En esta versión:
//  - el precio de una suscripción está en subscription.items.data[0].price (no en la suscripción);
//  - la suscripción de una factura está en invoice.parent.subscription_details.subscription
//    (ya no existe invoice.subscription; se lee también por si llega un aviso con versión vieja).

// Suscripciones que todavía pueden cobrar: no se debe abrir otra encima.
export const SUSCRIPCION_VIVA = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);
// Las únicas que dan acceso (igual que estadoEfectivo en plans.ts).
const AL_DIA = new Set(["active", "trialing"]);
// Todavía sin el primer pago: no cambian el estado del negocio (no cortan una prueba vigente).
const SIN_PRIMER_PAGO = new Set(["incomplete", "incomplete_expired"]);

// Los tipos de aviso que maneja Studio (los que hay que encender en Stripe).
export const EVENTOS_STRIPE = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

type ConId = string | { id: string } | null | undefined;
export const idDe = (v: ConId): string | undefined => (typeof v === "string" ? v : v?.id) || undefined;

// El plan que corresponde a un precio de Stripe (null si no es ninguno de los nuestros).
export function planDePrecio(priceId: string | undefined, cfg: PlanesConfig): "basico" | "pro" | null {
  if (!priceId) return null;
  if (priceId === cfg.precios.basico.stripePriceId) return "basico";
  if (priceId === cfg.precios.pro.stripePriceId) return "pro";
  return null;
}

// La suscripción de una factura (versión nueva y, por si acaso, la vieja).
export function suscripcionDeFactura(inv: Stripe.Invoice): string | undefined {
  const nueva = idDe(inv.parent?.subscription_details?.subscription);
  const vieja = idDe((inv as unknown as { subscription?: ConId }).subscription);
  return nueva ?? vieja;
}

// Dónde buscar el negocio de un aviso: ids que pusimos nosotros y el cliente de Stripe.
export function referenciasDeEvento(evento: Stripe.Event): { negocioIds: string[]; customerId?: string } {
  const o = evento.data.object as unknown as Record<string, unknown>;
  const ids: unknown[] = [];
  if (evento.type === "checkout.session.completed") ids.push(o.client_reference_id);
  ids.push((o.metadata as Record<string, unknown> | undefined)?.negocioId);
  if (evento.type.startsWith("invoice.")) {
    const inv = o as unknown as Stripe.Invoice;
    ids.push(inv.parent?.subscription_details?.metadata?.negocioId);
  }
  const negocioIds = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))];
  return { negocioIds, customerId: idDe(o.customer as ConId) };
}

// Quita los campos undefined (Firestore no los acepta).
function limpio<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// Calcula los cambios del negocio para un aviso. Devuelve null si no hay que cambiar nada.
export function aplicarEvento(evento: Stripe.Event, negocio: Negocio, cfg: PlanesConfig): Partial<Negocio> | null {
  const cuando = evento.created * 1000;
  const reloj = negocio.stripe?.ultimoEvento ?? 0;
  // Llegó desordenado: ya se aplicó un aviso más nuevo
  if (cuando < reloj) return null;

  const previo = negocio.stripe ?? {};
  const actual = previo.subscriptionId;
  const actualViva = !!actual && SUSCRIPCION_VIVA.has(previo.status ?? "");
  // Una suscripción distinta solo se adopta si la actual ya no cobra (si no, sería un doble cobro:
  // no se toca nada y el webhook deja el aviso en el registro).
  const puedeAdoptar = (sub: string) => !actual || sub === actual || !actualViva;
  const conPagoManual = negocio.origen === "manual";

  switch (evento.type) {
    case "checkout.session.completed": {
      const ses = evento.data.object;
      if (ses.mode !== "subscription") return null;
      const sub = idDe(ses.subscription);
      if (!sub || !puedeAdoptar(sub)) return null;
      const nueva = sub !== actual;
      // Solo guarda los ids; el estado y el plan los pone el aviso de la suscripción.
      // No adelanta el reloj: subscription.created puede ser un poco más viejo y llegar después.
      return {
        origen: "stripe",
        stripe: limpio({
          ...previo,
          customerId: idDe(ses.customer) ?? previo.customerId,
          subscriptionId: sub,
          // El status guardado era de la suscripción anterior
          status: nueva ? undefined : previo.status,
          priceId: nueva ? undefined : previo.priceId,
          // Esta sesión ya se pagó: ya no está pendiente
          checkoutPendiente: previo.checkoutPendiente === ses.id ? undefined : previo.checkoutPendiente,
          ultimoEvento: reloj,
        }),
      };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = evento.data.object;
      if (!puedeAdoptar(sub.id)) return null;
      const borrada = evento.type === "customer.subscription.deleted";
      const status = borrada ? "canceled" : sub.status;
      // Una suscripción cancelada no revive (protege contra avisos del mismo segundo en otro orden)
      if (!borrada && sub.id === actual && previo.status === "canceled" && status !== "canceled") return null;

      const priceId = sub.items?.data?.[0]?.price?.id;
      const stripe = limpio({
        ...previo,
        customerId: idDe(sub.customer) ?? previo.customerId,
        subscriptionId: sub.id,
        status,
        priceId: priceId ?? previo.priceId,
        ultimoEvento: Math.max(reloj, cuando),
      });

      // Sin el primer pago, o con un pago a mano vigente en el negocio: solo se anota lo de Stripe
      if (SIN_PRIMER_PAGO.has(status) || (conPagoManual && !AL_DIA.has(status))) return { stripe };

      // Un precio que no es de los nuestros nunca da Pro: queda en Básico (y se avisa en el registro)
      let plan = planDePrecio(priceId, cfg);
      if (!plan) {
        console.warn(`Stripe: la suscripción ${sub.id} tiene un precio desconocido (${priceId ?? "sin precio"}); se toma como Básico.`);
        plan = "basico";
      }
      return {
        stripe,
        origen: "stripe",
        plan,
        estado: AL_DIA.has(status) ? "activo" : "pausado",
      };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      // Solo cuenta la factura de la suscripción actual de este negocio
      const sub = suscripcionDeFactura(evento.data.object);
      if (!actual || sub !== actual) return null;
      if (negocio.origen !== "stripe") return null;
      // Las facturas llevan su propio reloj: un pago fallido viejo que llega tarde no pausa
      const relojFactura = previo.ultimaFactura ?? 0;
      if (cuando < relojFactura) return null;
      const pagada = evento.type === "invoice.paid";
      // Solo cambian el estado si cuadra con la suscripción guardada; si no, deciden los avisos
      // de la suscripción (p. ej. una factura pagada de una suscripción ya cancelada no reactiva)
      if (pagada && !AL_DIA.has(previo.status ?? "")) return null;
      if (!pagada && !SUSCRIPCION_VIVA.has(previo.status ?? "")) return null;
      // No adelantan el reloj de la suscripción: subscription.created puede ser más viejo y llegar después
      return {
        estado: pagada ? "activo" : "pausado",
        stripe: limpio({ ...previo, ultimoEvento: reloj, ultimaFactura: cuando }),
      };
    }

    default:
      return null;
  }
}
