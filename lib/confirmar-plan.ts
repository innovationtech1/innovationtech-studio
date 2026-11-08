import type { Efectivo, Negocio } from "./plans";

// ¿Hay que confirmar antes de cambiar de plan? Solo cuando ya paga con tarjeta una suscripción
// viva en este modo de Stripe: el cambio se cobra (o se acredita) al momento, sin pasar por la
// página de pago de Stripe, que es donde normalmente se ve el monto. Función pura: se usa en
// «Elige tu plan» y se prueba sin pantalla.

export type DatosCambio = {
  negocio: { origen: Negocio["origen"]; stripe?: { subscriptionId?: string } };
  efectivo: Pick<Efectivo, "estado" | "plan">;
  precios: { basico: number; pro: number };
};

export function confirmacionCambio(
  cuenta: DatosCambio,
  planNuevo: "basico" | "pro",
): { mensaje: string; boton: string } | null {
  const { negocio, efectivo, precios } = cuenta;
  // Primer pago (Stripe muestra el monto), pago a mano, pausado o sin plan (abre el portal o
  // vuelve a pagar): no hace falta preguntar
  if (negocio.origen !== "stripe" || !negocio.stripe?.subscriptionId) return null;
  if (efectivo.estado !== "activo") return null;
  if (efectivo.plan === planNuevo) return null;

  if (planNuevo === "pro") {
    return {
      mensaje: `Vas a pasar al plan Pro ($${precios.pro} al mes). Hoy se cobra solo la diferencia por los días que quedan de este mes, con tu tarjeta guardada. ¿Confirmas?`,
      boton: "Sí, cambiar a Pro",
    };
  }
  return {
    mensaje: `Vas a pasar al plan Básico ($${precios.basico} al mes). Lo que ya pagaste de Pro este mes queda como crédito para tus próximos cobros. Tu equipo dejará de poder usar Studio. ¿Confirmas?`,
    boton: "Sí, cambiar a Básico",
  };
}
