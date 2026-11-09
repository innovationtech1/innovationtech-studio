import { activarManual, agregarPaquete, finDelDiaChicago, obtenerNegocio, pausar, quitarManualPendiente, quitarSaldo, reactivar } from "@/lib/admin-api";
import type { PaqueteId, Saldo } from "@/lib/plans";
import { pasarAManual } from "@/lib/stripe-api";
import { cuerpoJson, errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Un negocio con su estado efectivo y sus pagos a mano (solo administrador).
export async function GET(req: Request, ctx: Ctx) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const { id } = await ctx.params;
  const r = await obtenerNegocio(s.email, s.emailVerified, id);
  return r.ok ? json({ negocio: r.negocio, efectivo: r.efectivo, pagos: r.pagos, movimientos: r.movimientos }) : errorJson(r);
}

// Acciones: { accion: "activar", plan, fecha | hasta, monto, metodo, nota? } | { accion: "pausar" } | { accion: "reactivar" }
//   | { accion: "paquete", paquete, metodo, nota? } | { accion: "quitar_saldo", cantidades, nota? }
//   | { accion: "pasar_a_manual", plan, fecha, monto, metodo, nota? } (de tarjeta a pago a mano al final del mes)
//   | { accion: "quitar_manual_pendiente" } (borra el pago a mano pendiente; no toca Stripe)
export async function POST(req: Request, ctx: Ctx) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const { id } = await ctx.params;
  const b = await cuerpoJson(req);
  let r;
  if (b.accion === "activar") {
    // La página manda `fecha` (AAAA-MM-DD): aquí se pasa al fin de ese día en Chicago. También se acepta `hasta` en ms.
    const hasta = typeof b.fecha === "string" ? finDelDiaChicago(b.fecha) : (b.hasta as number);
    r = await activarManual(s.email, s.emailVerified, id, {
      plan: b.plan as "basico" | "pro",
      hasta,
      monto: b.monto as number,
      metodo: b.metodo as "efectivo",
      nota: typeof b.nota === "string" ? b.nota : undefined,
    });
  } else if (b.accion === "pasar_a_manual") {
    // `fecha` (AAAA-MM-DD) hasta cuándo pagó a mano: fin de ese día en Chicago
    const hasta = typeof b.fecha === "string" ? finDelDiaChicago(b.fecha) : Number.NaN;
    const p = await pasarAManual(s.email, s.emailVerified, id, {
      plan: b.plan as "basico" | "pro",
      hasta,
      monto: b.monto as number,
      metodo: b.metodo as "efectivo",
      nota: typeof b.nota === "string" ? b.nota : undefined,
    });
    return p.ok ? json({ ok: true, finTarjeta: p.finTarjeta }) : errorJson(p);
  } else if (b.accion === "quitar_manual_pendiente") {
    r = await quitarManualPendiente(s.email, s.emailVerified, id);
  } else if (b.accion === "pausar") {
    r = await pausar(s.email, s.emailVerified, id);
  } else if (b.accion === "reactivar") {
    r = await reactivar(s.email, s.emailVerified, id);
  } else if (b.accion === "paquete") {
    r = await agregarPaquete(s.email, s.emailVerified, id, {
      paquete: b.paquete as PaqueteId,
      metodo: b.metodo as "efectivo",
      nota: typeof b.nota === "string" ? b.nota : undefined,
    });
  } else if (b.accion === "quitar_saldo") {
    r = await quitarSaldo(s.email, s.emailVerified, id, {
      cantidades: b.cantidades as Saldo,
      nota: typeof b.nota === "string" ? b.nota : undefined,
    });
  } else {
    return json({ error: "Acción no válida." }, 400);
  }
  return r.ok ? json({ ok: true }) : errorJson(r);
}
