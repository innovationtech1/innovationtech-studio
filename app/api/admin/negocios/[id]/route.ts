import { activarManual, finDelDiaChicago, obtenerNegocio, pausar, reactivar } from "@/lib/admin-api";
import { cuerpoJson, errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Un negocio con su estado efectivo y sus pagos a mano (solo administrador).
export async function GET(req: Request, ctx: Ctx) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const { id } = await ctx.params;
  const r = await obtenerNegocio(s.email, s.emailVerified, id);
  return r.ok ? json({ negocio: r.negocio, efectivo: r.efectivo, pagos: r.pagos }) : errorJson(r);
}

// Acciones: { accion: "activar", plan, fecha | hasta, monto, metodo, nota? } | { accion: "pausar" } | { accion: "reactivar" }
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
  } else if (b.accion === "pausar") {
    r = await pausar(s.email, s.emailVerified, id);
  } else if (b.accion === "reactivar") {
    r = await reactivar(s.email, s.emailVerified, id);
  } else {
    return json({ error: "Acción no válida." }, 400);
  }
  return r.ok ? json({ ok: true }) : errorJson(r);
}
