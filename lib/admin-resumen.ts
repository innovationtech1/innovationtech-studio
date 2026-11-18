// Resumen del panel de administrador: cuántos negocios hay en cada estado y cuánto entra al mes.
// Sin pantalla, para poder probarlo.

type FilaMinima = { efectivo: { estado: "prueba" | "activo" | "pausado" | "sin_plan"; plan: string | null } };

export type ResumenNegocios = { total: number; activos: number; prueba: number; pausados: number; ingresoMensual: number };

// `precios`: lo que cuesta cada plan al mes (USD). Solo cuentan los negocios activos con plan de pago.
export function resumenNegocios(filas: FilaMinima[], precios: Record<string, number>): ResumenNegocios {
  const r: ResumenNegocios = { total: filas.length, activos: 0, prueba: 0, pausados: 0, ingresoMensual: 0 };
  for (const f of filas) {
    if (f.efectivo.estado === "activo") {
      r.activos++;
      r.ingresoMensual += precios[f.efectivo.plan ?? ""] ?? 0;
    } else if (f.efectivo.estado === "prueba") r.prueba++;
    else r.pausados++; // en pausa o sin plan: no están pagando
  }
  return r;
}
