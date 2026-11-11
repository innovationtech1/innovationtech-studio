import { CAMPOS_ENVIO, esEnvioVigente, ordenFila, type TrabajoVideo, type VideoStore } from "./video-store";

// Versión en memoria del almacén de video, para las pruebas. Cada método corre de un tirón
// (sin await en medio), así que es atómico como una transacción.
export type MemoryVideoStore = VideoStore & { todos(): TrabajoVideo[] };

export function memoryVideoStore(semilla: { gasto?: Record<string, number> } = {}): MemoryVideoStore {
  const trabajos = new Map<string, TrabajoVideo>();
  const gasto = new Map<string, number>(Object.entries(semilla.gasto ?? {}));
  const cache = new Map<string, string>();
  const candados = new Map<string, number>();
  const copia = <T>(v: T): T => structuredClone(v);
  const todos = () => [...trabajos.values()].map(copia);
  return {
    todos,
    async crearTrabajos(lista) {
      for (const t of lista) {
        if (trabajos.has(t.id)) throw new Error(`El trabajo ${t.id} ya existe`);
        trabajos.set(t.id, copia(t));
      }
    },
    async getTrabajo(id) {
      const t = trabajos.get(id);
      return t ? copia(t) : null;
    },
    async listarTrabajos(ids) {
      return ids.flatMap((id) => (trabajos.has(id) ? [copia(trabajos.get(id)!)] : []));
    },
    async trabajosEnFila(limite) {
      return todos().filter((t) => t.estado === "en_fila").sort(ordenFila).slice(0, limite);
    },
    async trabajosEnviados() {
      return todos().filter((t) => t.estado === "enviado");
    },
    async trabajosDesde(ms, limite) {
      return todos().filter((t) => t.actualizado >= ms).sort((a, b) => b.actualizado - a.actualizado).slice(0, limite);
    },
    async contarEnviados() {
      return todos().filter((t) => t.estado === "enviado").length;
    },
    async marcarEnviado(id, o) {
      const t = trabajos.get(id);
      if (!t || t.estado !== "en_fila") return "no_en_fila";
      const hoy = gasto.get(o.dia) ?? 0;
      if (hoy + o.costo > o.tope) return "tope";
      if (todos().filter((x) => x.estado === "enviado").length >= o.simultaneos) return "lleno";
      Object.assign(t, { estado: "enviado", enviado: o.ahora, diaGasto: o.dia, costoCentavos: o.costo, actualizado: o.ahora });
      gasto.set(o.dia, hoy + o.costo);
      return "ok";
    },
    async guardarEnvio(id, datos) {
      const t = trabajos.get(id);
      if (t) Object.assign(t, datos);
    },
    async terminarTrabajo(id, cambios, opciones = {}) {
      const t = trabajos.get(id);
      if (!t || t.estado !== "enviado" || !esEnvioVigente(t, opciones.requestId)) return false;
      if (opciones.devolverGasto && t.diaGasto) gasto.set(t.diaGasto, Math.max(0, (gasto.get(t.diaGasto) ?? 0) - t.costoCentavos));
      const limpio = Object.fromEntries(Object.entries(copia(cambios)).filter(([k, v]) => v !== undefined && k !== "id"));
      Object.assign(t, limpio);
      if (cambios.estado === "en_fila") for (const k of CAMPOS_ENVIO) delete t[k];
      return true;
    },
    async getGasto(dia) {
      return gasto.get(dia) ?? 0;
    },
    async getCache(llave) {
      return cache.get(llave) ?? null;
    },
    async guardarCache(llave, clipKey) {
      cache.set(llave, clipKey);
    },
    async tomarCandado(nombre, ms, ahora) {
      if ((candados.get(nombre) ?? 0) > ahora) return false;
      candados.set(nombre, ahora + ms);
      return true;
    },
    async soltarCandado(nombre) {
      candados.delete(nombre);
    },
  };
}
