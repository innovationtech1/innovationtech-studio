// Textos de los estados de un video con IA, tal como se ven en el estudio de reels.
// Funciones puras (sin pantalla) para poder probarlas.

// vencido: estaba lista, pero su clip ya se borró (las de la prueba gratis duran 30 días)
export type TrabajoVisto = { id: string; estado: "en_fila" | "enviado" | "listo" | "fallo"; lugar?: number; clipUrl?: string; desdeCache?: boolean; vencido?: boolean };

export type FaseVideo =
  | { tipo: "subiendo"; pct: number }
  | { tipo: "previa" }
  | { tipo: "trabajos"; trabajos: readonly TrabajoVisto[]; topeHoy: boolean };

export const terminado = (trabajos: readonly TrabajoVisto[]) =>
  trabajos.length > 0 && trabajos.every((t) => t.estado === "listo" || t.estado === "fallo");

// Cuándo volver a consultar mientras se espera (null = dejar de esperar; las tomas siguen en camino).
// - Sin cupo hoy y nada generándose: cada 10 min, sin rendirse (salen al día siguiente).
// - Hasta el límite duro de 45 min (cuando el servidor resuelve una toma atorada): 10 s mientras se genera
//   en los primeros 20 min, luego 30 s; 30 s si solo espera en fila.
const MIN = 60_000;
export function siguienteEspera(trabajos: readonly TrabajoVisto[], topeHoy: boolean, transcurridoMs: number): number | null {
  const generando = trabajos.some((t) => t.estado === "enviado");
  if (topeHoy && !generando) return 10 * MIN;
  if (transcurridoMs > 46 * MIN) return null;
  return generando && transcurridoMs < 20 * MIN ? 10_000 : 30_000;
}

// ¿Soltar el editor y seguir esperando en segundo plano? Sí cuando hoy ya no hay cupo y ninguna se está
// generando: salen hasta mañana y no tiene caso dejar el editor ocupado.
export const esperarEnFondo = (trabajos: readonly TrabajoVisto[], topeHoy: boolean) =>
  topeHoy && trabajos.length > 0 && !terminado(trabajos) && !trabajos.some((t) => t.estado === "enviado");

export function textoEstado(f: FaseVideo): string {
  if (f.tipo === "subiendo") return `Subiendo… ${Math.max(0, Math.min(100, Math.round(f.pct)))}%`;
  if (f.tipo === "previa") return "Vista previa lista";
  const t = f.trabajos;
  const enFila = t.filter((x) => x.estado === "en_fila");
  const generando = t.some((x) => x.estado === "enviado");
  if (terminado(t)) {
    if (t.some((x) => x.estado === "fallo")) return "No se pudo generar la toma, te devolvimos tu crédito";
    return t.every((x) => x.desdeCache) ? "Listo al instante" : "Listo";
  }
  if (generando) {
    const resueltas = t.filter((x) => x.estado === "listo" || x.estado === "fallo").length;
    return `Toma ${resueltas + 1} de ${t.length} · Generando…`;
  }
  if (enFila.length > 0 && f.topeHoy) return "Hoy ya no hay cupo; tu video se genera mañana";
  return `En fila, lugar ${Math.min(...enFila.map((x) => x.lugar ?? 1))}`;
}

// Identifica un pedido de tomas (fotos + movimiento): si el cliente vuelve a tocar «Generar con IA»
// con lo mismo mientras siguen en proceso, se retoman en vez de pedirlas (y descontarlas) otra vez.
export function firmaTomas(tomas: { sha256: string; movimiento: string }[]): string {
  return tomas.map((t) => `${t.sha256}|${t.movimiento.toLowerCase().replace(/\s+/g, " ").trim()}`).join(";");
}
