import type { Efectivo, Negocio } from "./plans";

// ¿Hay que confirmar antes de cambiar de plan? Solo cuando ya paga con tarjeta una suscripción
// viva en este modo de Stripe: el cambio se cobra (o se acredita) al momento, sin pasar por la
// página de pago de Stripe, que es donde normalmente se ve el monto. Función pura: se usa en
// «Elige tu plan» y se prueba sin pantalla.

export type DatosCambio = {
  negocio: {
    origen: Negocio["origen"];
    stripe?: { subscriptionId?: string; status?: string };
    pagadoHasta?: number;
    manualSiguiente?: Negocio["manualSiguiente"];
  };
  efectivo: Pick<Efectivo, "estado" | "plan">;
  precios: { basico: number; pro: number };
};

export function confirmacionCambio(
  cuenta: DatosCambio,
  planNuevo: "basico" | "pro",
  ahora = Date.now(),
): { mensaje: string; boton: string } | null {
  const { negocio, efectivo, precios } = cuenta;
  // Primer pago (Stripe muestra el monto), pago a mano, pausado o sin plan (abre el portal o
  // vuelve a pagar): no hace falta preguntar
  if (negocio.origen !== "stripe" || !negocio.stripe?.subscriptionId) return null;
  if (efectivo.estado !== "activo") return null;
  if (efectivo.plan === planNuevo) return null;
  // En la prueba que cubre lo pagado a mano, o con un pago a mano pendiente, el servidor no cambia
  // el plan (pide escribirle al equipo): no se promete un cobro que no va a pasar
  const enPruebaPagada = negocio.stripe?.status === "trialing" && negocio.pagadoHasta !== undefined && negocio.pagadoHasta > ahora;
  if (enPruebaPagada || negocio.manualSiguiente) return null;

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

// «8 de diciembre»: la fecha del primer cobro, en la hora de Chicago
const fechaCobro = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Chicago", day: "numeric", month: "long" });

// De pago a mano a tarjeta (mismo plan): hoy no se cobra nada, el primer cobro es cuando termina
// lo pagado a mano. Recibe `cuenta.pasarATarjeta` (null si el servidor no ofrece la opción).
export function confirmacionPasarATarjeta(
  pasarATarjeta: { fecha: number; precio: number } | null,
): { mensaje: string; boton: string } | null {
  if (!pasarATarjeta) return null;
  const { fecha, precio } = pasarATarjeta;
  return {
    mensaje: `Vas a pasar a pago con tarjeta. Hoy no se te cobra nada: tu primer cobro de $${precio} será el ${fechaCobro.format(fecha)}, cuando termina lo que pagaste a mano. ¿Continuar?`,
    boton: "Sí, pasar a tarjeta",
  };
}
