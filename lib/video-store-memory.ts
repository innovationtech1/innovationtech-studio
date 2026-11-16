import { CAMPOS_ENVIO, clipVencido, esEnvioVigente, ordenFila, type TrabajoVideo, type VideoStore } from "./video-store";

// Versión en memoria del almacén de video, para las pruebas. Cada método corre de un tirón
// (sin await en medio), así que es atómico como una transacción.
export type MemoryVideoStore = VideoStore & { todos(): TrabajoVideo[] };

export function memoryVideoStore(semilla: { gasto?: Record<string, number> } = {}): MemoryVideoStore {
  const trabajos = new Map<string, TrabajoVideo>();
  const gasto = new Map<string, number>(Object.entries(semilla.gasto ?? {}));
  const cache = new Map<string, { clipKey: string; creado: number }>();
  const candados = new Map<string, { hasta: number; ficha: string }>();
  let fichas = 0;
  const porDia = new Map<string, number>(); // negocio|día → tomas nuevas
  const copia = <T>(v: T): T => structuredClone(v);
  const todos = () => [...trabajos.values()].map(copia);
  return {
    todos,
    async crearTrabajos(lista, cupo) {
      for (const t of lista) if (trabajos.has(t.id)) throw new Error(`El trabajo ${t.id} ya existe`);
      if (cupo && cupo.nuevas > 0) {
        const k = `${cupo.negocioId}|${cupo.dia}`;
        const ya = porDia.get(k) ?? 0;
        if (ya + cupo.nuevas > cupo.limite) return "limite";
        porDia.set(k, ya + cupo.nuevas);
      }
      for (const t of lista) trabajos.set(t.id, copia(t));
      return "ok";
    },
    async tomasDelDia(negocioId, dia) {
      return porDia.get(`${negocioId}|${dia}`) ?? 0;
    },
    async restarTomaDelDia(negocioId, dia) {
      const k = `${negocioId}|${dia}`;
      if (porDia.has(k)) porDia.set(k, Math.max(0, porDia.get(k)! - 1));
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
    async trabajosEnviados(limite) {
      return todos().filter((t) => t.estado === "enviado").slice(0, limite);
    },
    async borrarTrabajosDeNegocio(negocioId) {
      const ids = [...trabajos.values()].filter((t) => t.negocioId === negocioId).map((t) => t.id);
      for (const id of ids) trabajos.delete(id);
      for (const k of [...porDia.keys()]) if (k.startsWith(`${negocioId}|`)) porDia.delete(k);
      return ids.length;
    },
    async trabajoEnCurso(cacheLlave) {
      const t = todos().filter((x) => x.cacheLlave === cacheLlave && (x.estado === "en_fila" || x.estado === "enviado")).sort((x, y) => x.creado - y.creado)[0];
      return t ?? null;
    },
    async trabajosDesde(ms, limite) {
      return todos().filter((t) => t.actualizado >= ms).sort((a, b) => b.actualizado - a.actualizado).slice(0, limite);
    },
    async contarEnviados() {
      return todos().filter((t) => t.estado === "enviado").length;
    },
    async contarEnFila() {
      return todos().filter((t) => t.estado === "en_fila").length;
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
    async getCache(llave, ahora) {
      const c = cache.get(llave);
      return c && !clipVencido(c.clipKey, c.creado, ahora) ? { ...c } : null;
    },
    async guardarCache(llave, clipKey, ahora) {
      cache.set(llave, { clipKey, creado: ahora });
    },
    async tomarCandado(nombre, ms, ahora) {
      if ((candados.get(nombre)?.hasta ?? 0) > ahora) return null;
      const ficha = `ficha-${++fichas}`;
      candados.set(nombre, { hasta: ahora + ms, ficha });
      return ficha;
    },
    async soltarCandado(nombre, ficha) {
      if (candados.get(nombre)?.ficha === ficha) candados.delete(nombre);
    },
  };
}
