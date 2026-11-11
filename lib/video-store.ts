import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { colecciones } from "./colecciones";
import { db } from "./firebase-server";
import type { NivelModelo, Plan } from "./plans";

// Dónde se guardan los trabajos de video con IA (una toma = un trabajo), el caché de clips,
// el gasto del día y los candados. Igual que account-store: una interfaz con Firestore de verdad
// y una versión en memoria para las pruebas (video-store-memory.ts).

export type EstadoTrabajo = "en_fila" | "enviado" | "listo" | "fallo";

export type TrabajoVideo = {
  id: string;
  negocioId: string;
  uid: string;
  plan: Plan;
  prioridad: 1 | 2 | 3;
  nivel: NivelModelo;
  modelo: string; // id del modelo en fal.ai
  imagenKey: string;
  movimiento: string;
  estado: EstadoTrabajo;
  intentos: number; // envíos a fal que ya fallaron
  falRequestId?: string;
  statusUrl?: string;
  responseUrl?: string;
  clipKey?: string;
  costoCentavos: number;
  creado: number;
  actualizado: number;
  enviado?: number; // cuándo se mandó a fal (ms)
  diaGasto?: string; // día (Chicago) al que se sumó el costo
  secreto: string; // va en la URL del aviso; nunca se devuelve al navegador ni se registra
  reserva: { mes: string; delMes: number; delSaldo: number }; // lo que hay que devolver si falla
  cacheLlave: string;
  desdeCache?: boolean;
  error?: string; // motivo del último fallo (para el administrador; sin datos secretos)
};

export type OpcionesEnvio = { costo: number; dia: string; tope: number; simultaneos: number; ahora: number };
export type ResultadoEnvio = "ok" | "tope" | "lleno" | "no_en_fila";
export type DatosEnvio = { falRequestId: string; statusUrl: string; responseUrl: string };

export interface VideoStore {
  crearTrabajos(t: TrabajoVideo[]): Promise<void>;
  getTrabajo(id: string): Promise<TrabajoVideo | null>;
  // Solo los que existen, en el orden pedido.
  listarTrabajos(ids: string[]): Promise<TrabajoVideo[]>;
  // Los que esperan turno: por prioridad y luego del más viejo al más nuevo.
  trabajosEnFila(limite: number): Promise<TrabajoVideo[]>;
  trabajosEnviados(): Promise<TrabajoVideo[]>;
  // Los actualizados desde `ms`, del más nuevo al más viejo (para el resumen del administrador).
  trabajosDesde(ms: number, limite: number): Promise<TrabajoVideo[]>;
  contarEnviados(): Promise<number>;
  // Aparta el envío en UNA transacción: el trabajo pasa de en_fila a enviado y su costo se suma al
  // gasto del día. No cambia nada si ya no está en fila, si el gasto pasaría del tope o si ya hay
  // `simultaneos` enviados. Se llama ANTES de mandar a fal: así dos despachos a la vez no envían lo mismo.
  marcarEnviado(id: string, o: OpcionesEnvio): Promise<ResultadoEnvio>;
  // Guarda los datos que devolvió fal al aceptar el trabajo.
  guardarEnvio(id: string, datos: DatosEnvio): Promise<void>;
  // Saca el trabajo de «enviado» (a listo, fallo o de vuelta a la fila). Devuelve false, sin cambiar
  // nada, si ya no estaba enviado (aviso repetido) o si `requestId` no es el del envío vigente.
  // Con devolverGasto, resta su costo del gasto del día en que se envió (misma transacción).
  terminarTrabajo(
    id: string,
    cambios: Partial<TrabajoVideo>,
    opciones?: { requestId?: string; devolverGasto?: boolean },
  ): Promise<boolean>;
  getGasto(dia: string): Promise<number>;
  getCache(llave: string): Promise<string | null>;
  guardarCache(llave: string, clipKey: string): Promise<void>;
  // Candado con vencimiento: true si lo tomó. Vence solo a los `ms` (por si el servidor se cae).
  tomarCandado(nombre: string, ms: number, ahora: number): Promise<boolean>;
  soltarCandado(nombre: string): Promise<void>;
}

// Orden de la fila.
export const ordenFila = (a: TrabajoVideo, b: TrabajoVideo) => a.prioridad - b.prioridad || a.creado - b.creado || a.id.localeCompare(b.id);

// ¿Este aviso corresponde al envío vigente? (si todavía no se guardó el id del envío, se acepta)
export const esEnvioVigente = (t: TrabajoVideo, requestId?: string) =>
  requestId === undefined || t.falRequestId === undefined || t.falRequestId === requestId;

// Campos que se quitan al salir de «enviado» hacia la fila (para el siguiente intento).
export const CAMPOS_ENVIO = ["falRequestId", "statusUrl", "responseUrl", "enviado", "diaGasto"] as const;

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const sinUndefined = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export function firestoreVideoStore(): VideoStore {
  const C = colecciones();
  const trabajos = () => db().collection(C.trabajosVideo);
  const deDoc = (d: FirebaseFirestore.DocumentSnapshot) => ({ ...(d.data() as Omit<TrabajoVideo, "id">), id: d.id }) as TrabajoVideo;
  // Sin índices compuestos: se filtra por estado y se ordena aquí (la fila es corta).
  const porEstado = async (estado: EstadoTrabajo) => (await trabajos().where("estado", "==", estado).get()).docs.map(deDoc);
  return {
    async crearTrabajos(lista) {
      if (lista.length === 0) return;
      const lote = db().batch();
      for (const { id, ...datos } of lista) lote.create(trabajos().doc(id), sinUndefined(datos));
      await lote.commit();
    },
    async getTrabajo(id) {
      const s = await trabajos().doc(id).get();
      return s.exists ? deDoc(s) : null;
    },
    async listarTrabajos(ids) {
      if (ids.length === 0) return [];
      const docs = await db().getAll(...ids.map((id) => trabajos().doc(id)));
      return docs.filter((d) => d.exists).map(deDoc);
    },
    async trabajosEnFila(limite) {
      return (await porEstado("en_fila")).sort(ordenFila).slice(0, limite);
    },
    trabajosEnviados: () => porEstado("enviado"),
    async trabajosDesde(ms, limite) {
      return (await trabajos().where("actualizado", ">=", ms).orderBy("actualizado", "desc").limit(limite).get()).docs.map(deDoc);
    },
    async contarEnviados() {
      return (await trabajos().where("estado", "==", "enviado").count().get()).data().count;
    },
    async marcarEnviado(id, o) {
      const ref = trabajos().doc(id);
      const refGasto = db().collection(C.gastoVideo).doc(o.dia);
      return db().runTransaction(async (t): Promise<ResultadoEnvio> => {
        // Todos los envíos leen y escriben el gasto del día: Firestore los pone en fila uno tras otro,
        // así la cuenta de simultáneos que se lee aquí ya incluye al envío anterior.
        const [s, g] = await Promise.all([t.get(ref), t.get(refGasto)]);
        if (!s.exists || s.data()?.estado !== "en_fila") return "no_en_fila";
        const gasto = numero(g.data()?.centavos);
        if (gasto + o.costo > o.tope) return "tope";
        const enviados = await t.get(trabajos().where("estado", "==", "enviado"));
        if (enviados.size >= o.simultaneos) return "lleno";
        t.update(ref, { estado: "enviado", enviado: o.ahora, diaGasto: o.dia, costoCentavos: o.costo, actualizado: o.ahora });
        t.set(refGasto, { centavos: gasto + o.costo, actualizado: o.ahora }, { merge: true });
        return "ok";
      });
    },
    async guardarEnvio(id, datos) {
      await trabajos().doc(id).update(datos);
    },
    async terminarTrabajo(id, cambios, opciones = {}) {
      const ref = trabajos().doc(id);
      return db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists) return false;
        const actual = deDoc(s);
        if (actual.estado !== "enviado" || !esEnvioVigente(actual, opciones.requestId)) return false;
        const refGasto = opciones.devolverGasto && actual.diaGasto ? db().collection(C.gastoVideo).doc(actual.diaGasto) : null;
        const g = refGasto ? await t.get(refGasto) : null;
        const datos: Record<string, unknown> = sinUndefined(cambios);
        delete datos.id;
        if (cambios.estado === "en_fila") for (const k of CAMPOS_ENVIO) datos[k] = FieldValue.delete();
        t.update(ref, datos);
        if (refGasto && g?.exists) t.update(refGasto, { centavos: Math.max(0, numero(g.data()?.centavos) - actual.costoCentavos) });
        return true;
      });
    },
    async getGasto(dia) {
      return numero((await db().collection(C.gastoVideo).doc(dia).get()).data()?.centavos);
    },
    async getCache(llave) {
      const v = (await db().collection(C.cacheVideo).doc(llave).get()).data()?.clipKey;
      return typeof v === "string" ? v : null;
    },
    async guardarCache(llave, clipKey) {
      await db().collection(C.cacheVideo).doc(llave).set({ clipKey, creado: Date.now() });
    },
    async tomarCandado(nombre, ms, ahora) {
      const ref = db().collection(C.candados).doc(nombre);
      return db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (s.exists && numero(s.data()?.hasta) > ahora) return false;
        t.set(ref, { hasta: ahora + ms });
        return true;
      });
    },
    async soltarCandado(nombre) {
      await db().collection(C.candados).doc(nombre).delete();
    },
  };
}
