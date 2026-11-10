// Textos de los estados de un video con IA, tal como se ven en el estudio de reels.
// Funciones puras (sin pantalla) para poder probarlas.

export type TrabajoVisto = { id: string; estado: "en_fila" | "enviado" | "listo" | "fallo"; lugar?: number; clipUrl?: string; desdeCache?: boolean };

export type FaseVideo =
  | { tipo: "subiendo"; pct: number }
  | { tipo: "previa" }
  | { tipo: "trabajos"; trabajos: readonly TrabajoVisto[]; topeHoy: boolean };

export const terminado = (trabajos: readonly TrabajoVisto[]) =>
  trabajos.length > 0 && trabajos.every((t) => t.estado === "listo" || t.estado === "fallo");

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
