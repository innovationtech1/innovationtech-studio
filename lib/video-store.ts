import "server-only";
import { randomUUID } from "node:crypto";
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
  clipCreado?: number; // cuándo se guardó el clip en R2 (los de demo/ se borran a los 30 días)
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

// Cupo por cliente y por día (hora de Chicago): cuántas tomas nuevas suma este pedido y el límite.
export type CupoDia = { negocioId: string; dia: string; nuevas: number; limite: number };

export interface VideoStore {
  // Crea los trabajos. Con cupo, en la MISMA operación suma `nuevas` al contador del día del negocio;
  // si se pasaría del límite no crea nada y devuelve "limite".
  crearTrabajos(t: TrabajoVideo[], cupo?: CupoDia): Promise<"ok" | "limite">;
  // Tomas nuevas que el negocio ya pidió ese día (sin las que salieron del caché ni las que fallaron).
  tomasDelDia(negocioId: string, dia: string): Promise<number>;
  // Una toma que falló del todo (y se devolvió) deja de contar para el límite de su día.
  restarTomaDelDia(negocioId: string, dia: string): Promise<void>;
  getTrabajo(id: string): Promise<TrabajoVideo | null>;
  // Solo los que existen, en el orden pedido.
  listarTrabajos(ids: string[]): Promise<TrabajoVideo[]>;
  // Los que esperan turno: por prioridad y luego del más viejo al más nuevo.
  trabajosEnFila(limite: number): Promise<TrabajoVideo[]>;
  // Los que están en fal ahora (son pocos: no pasan de `simultaneos`, salvo atorados). Hasta `limite`.
  trabajosEnviados(limite: number): Promise<TrabajoVideo[]>;
  // El trabajo con esa llave que sigue en camino (en fila o enviado), o null. La llave ya incluye al negocio.
  trabajoEnCurso(cacheLlave: string): Promise<TrabajoVideo | null>;
  // Borra todos los trabajos de un negocio y sus contadores del día (al borrar la cuenta). Devuelve cuántos trabajos eran.
  borrarTrabajosDeNegocio(negocioId: string): Promise<number>;
  // Los actualizados desde `ms`, del más nuevo al más viejo (para el resumen del administrador).
  trabajosDesde(ms: number, limite: number): Promise<TrabajoVideo[]>;
  contarEnviados(): Promise<number>;
  contarEnFila(): Promise<number>;
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
  // El clip ya generado para esa llave, o null. Los de demo/ con más de 29 días no cuentan (R2 los borra a los 30).
  getCache(llave: string, ahora: number): Promise<{ clipKey: string; creado: number } | null>;
  guardarCache(llave: string, clipKey: string, ahora: number): Promise<void>;
  // Candado con vencimiento: devuelve una ficha si lo tomó (null si no). Vence solo a los `ms` (por si el
  // servidor se cae). Soltar solo lo borra si sigue siendo de esa ficha (si venció y otro lo tomó, no se toca).
  tomarCandado(nombre: string, ms: number, ahora: number): Promise<string | null>;
  soltarCandado(nombre: string, ficha: string): Promise<void>;
}

// Un clip de demo/ que ya no sirve: R2 lo borra a los 30 días; con 29 ya no se entrega.
export const VIDA_DEMO_MS = 29 * 24 * 60 * 60 * 1000;
export const clipVencido = (clipKey: string, creado: number, ahora: number) => clipKey.startsWith("demo/") && ahora - creado > VIDA_DEMO_MS;

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
  const contador = (negocioId: string, dia: string) => db().collection(C.tomasDia).doc(`${negocioId}_${dia}`);
  // La fila en orden (prioridad y antigüedad) con tope de lecturas. Usa el índice compuesto de
  // firestore.indexes.json; si todavía no está publicado, lee hasta `limite` por estado y ordena aquí.
  let sinIndice = false;
  const fila = async (limite: number): Promise<TrabajoVideo[]> => {
    const base = trabajos().where("estado", "==", "en_fila");
    if (!sinIndice) {
      try {
        return (await base.orderBy("prioridad").orderBy("creado").limit(limite).get()).docs.map(deDoc);
      } catch (e) {
        if ((e as { code?: unknown }).code !== 9) throw e; // 9 = FAILED_PRECONDITION: falta el índice
        sinIndice = true;
        console.warn("Video con IA: falta publicar el índice de la fila (firestore.indexes.json); se ordena en el servidor.");
      }
    }
    return (await base.limit(Math.max(limite, 100)).get()).docs.map(deDoc).sort(ordenFila).slice(0, limite);
  };
  return {
    async crearTrabajos(lista, cupo) {
      if (lista.length === 0) return "ok";
      if (!cupo || cupo.nuevas <= 0) {
        const lote = db().batch();
        for (const { id, ...datos } of lista) lote.create(trabajos().doc(id), sinUndefined(datos));
        await lote.commit();
        return "ok";
      }
      const ref = contador(cupo.negocioId, cupo.dia);
      return db().runTransaction(async (t) => {
        const ya = numero((await t.get(ref)).data()?.tomas);
        if (ya + cupo.nuevas > cupo.limite) return "limite" as const;
        for (const { id, ...datos } of lista) t.create(trabajos().doc(id), sinUndefined(datos));
        t.set(ref, { negocioId: cupo.negocioId, dia: cupo.dia, tomas: ya + cupo.nuevas }, { merge: true });
        return "ok" as const;
      });
    },
    async tomasDelDia(negocioId, dia) {
      return numero((await contador(negocioId, dia).get()).data()?.tomas);
    },
    async restarTomaDelDia(negocioId, dia) {
      const ref = contador(negocioId, dia);
      await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (s.exists) t.update(ref, { tomas: Math.max(0, numero(s.data()?.tomas) - 1) });
      });
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
    trabajosEnFila: (limite) => fila(limite),
    async trabajosEnviados(limite) {
      return (await trabajos().where("estado", "==", "enviado").limit(limite).get()).docs.map(deDoc);
    },
    async borrarTrabajosDeNegocio(negocioId) {
      const docs = (await trabajos().where("negocioId", "==", negocioId).get()).docs;
      // Firestore admite 500 cambios por lote
      for (let i = 0; i < docs.length; i += 400) {
        const lote = db().batch();
        for (const d of docs.slice(i, i + 400)) lote.delete(d.ref);
        await lote.commit();
      }
      const contadores = (await db().collection(C.tomasDia).where("negocioId", "==", negocioId).get()).docs;
      for (let i = 0; i < contadores.length; i += 400) {
        const lote = db().batch();
        for (const d of contadores.slice(i, i + 400)) lote.delete(d.ref);
        await lote.commit();
      }
      return docs.length;
    },
    async trabajoEnCurso(cacheLlave) {
      // Un solo campo en la consulta (sin índice compuesto); el estado se filtra aquí
      const docs = (await trabajos().where("cacheLlave", "==", cacheLlave).get()).docs.map(deDoc);
      return docs.filter((t) => t.estado === "en_fila" || t.estado === "enviado").sort((x, y) => x.creado - y.creado)[0] ?? null;
    },
    async trabajosDesde(ms, limite) {
      return (await trabajos().where("actualizado", ">=", ms).orderBy("actualizado", "desc").limit(limite).get()).docs.map(deDoc);
    },
    async contarEnviados() {
      return (await trabajos().where("estado", "==", "enviado").count().get()).data().count;
    },
    async contarEnFila() {
      return (await trabajos().where("estado", "==", "en_fila").count().get()).data().count;
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
        const enviados = await t.get(trabajos().where("estado", "==", "enviado").limit(o.simultaneos));
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
    async getCache(llave, ahora) {
      const d = (await db().collection(C.cacheVideo).doc(llave).get()).data();
      if (typeof d?.clipKey !== "string") return null;
      const creado = numero(d.creado);
      return clipVencido(d.clipKey, creado, ahora) ? null : { clipKey: d.clipKey, creado };
    },
    async guardarCache(llave, clipKey, ahora) {
      await db().collection(C.cacheVideo).doc(llave).set({ clipKey, creado: ahora });
    },
    async tomarCandado(nombre, ms, ahora) {
      const ref = db().collection(C.candados).doc(nombre);
      const ficha = randomUUID();
      return db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (s.exists && numero(s.data()?.hasta) > ahora) return null;
        t.set(ref, { hasta: ahora + ms, ficha });
        return ficha;
      });
    },
    async soltarCandado(nombre, ficha) {
      const ref = db().collection(C.candados).doc(nombre);
      await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (s.exists && s.data()?.ficha === ficha) t.delete(ref);
      });
    },
  };
}
