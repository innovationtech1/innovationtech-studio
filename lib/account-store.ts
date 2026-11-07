import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./firebase-server";
import { mezclarConfig, type Contador, type Negocio, type PlanesConfig } from "./plans";

// Dónde se guardan las cuentas, los negocios y los contadores de uso.
// La interfaz permite cambiar Firestore por una versión falsa en las pruebas.

export type Usuario = {
  uid: string;
  email: string;
  negocioId: string;
  rol: "dueno" | "miembro";
  creado: number; // milisegundos
};

export type Uso = Record<Contador, number>;

export interface AccountStore {
  getUsuario(uid: string): Promise<Usuario | null>;
  getNegocio(id: string): Promise<Negocio | null>;
  getConfig(): Promise<PlanesConfig>;
  // Suma `unidades` al contador del día solo si no pasa del tope. Devuelve si pudo.
  reservarUso(negocioId: string, dia: string, c: Contador, unidades: number, tope: number): Promise<boolean>;
  // Resta `unidades` (por ejemplo, si la IA falló). Nunca baja de 0.
  devolverUso(negocioId: string, dia: string, c: Contador, unidades: number): Promise<void>;

  // Cuentas y equipo. Los correos siempre se guardan y se buscan en minúsculas.
  // Con `id` crea el negocio con ese id solo si no existe (devuelve null si ya existía).
  crearNegocio(n: Omit<Negocio, "id">, id?: string): Promise<Negocio | null>;
  usuarioPorEmail(email: string): Promise<Usuario | null>;
  // Crea el usuario solo si no existe. Devuelve false si ya existía (no lo pisa).
  crearUsuario(u: Usuario): Promise<boolean>;
  getInvitacion(email: string): Promise<Invitacion | null>;
  crearInvitacion(email: string, inv: Invitacion): Promise<void>;
  borrarInvitacion(email: string): Promise<void>;
  listarInvitaciones(negocioId: string): Promise<string[]>;
  // Agrega a `uid` a los miembros (sin repetirlo). Si pasas `max` y el negocio ya está lleno, devuelve false.
  unirMiembro(negocioId: string, uid: string, max?: number): Promise<boolean>;
  // Saca a `uid` de los miembros y borra su usuario (para que pueda crear su propio negocio),
  // pero solo si ese usuario pertenece a este negocio; si no, deja su usuario intacto.
  quitarMiembro(negocioId: string, uid: string): Promise<void>;
  // Contadores del día (ceros si todavía no hay).
  getUso(negocioId: string, dia: string): Promise<Uso>;

  // Panel del administrador
  // Todos los negocios, del más nuevo al más viejo (son pocas decenas: sin paginar).
  listarNegocios(): Promise<Negocio[]>;
  // Cambia solo los campos dados (el id no se toca).
  actualizarNegocio(id: string, cambios: Partial<Negocio>): Promise<void>;
  registrarPagoManual(p: PagoManual): Promise<void>;
  // Pagos a mano de un negocio, del más reciente al más viejo.
  listarPagosManuales(negocioId: string): Promise<PagoManual[]>;
}

export type PagoManual = {
  id: string;
  negocioId: string;
  plan: "basico" | "pro";
  monto: number;
  metodo: "efectivo" | "zelle" | "cashapp" | "otro";
  hasta: number; // hasta cuándo quedó pagado (ms)
  nota?: string;
  registradoPor: string; // correo del administrador
  fecha: number; // cuándo se registró (ms)
};

export type Invitacion = { negocioId: string; invitadoPor: string; creado: number };

export const COL_USUARIOS = "studio_usuarios";
export const COL_NEGOCIOS = "studio_negocios";
export const COL_USO = "studio_uso";
export const COL_INVITACIONES = "studio_invitaciones";
export const COL_CONFIG = "studio_config";
export const COL_PAGOS_MANUALES = "studio_pagos_manuales";

export const idUso = (negocioId: string, dia: string) => `${negocioId}_${dia}`;

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// Implementación real con Firestore. No toca Firestore hasta que se usa un método.
export function firestoreStore(): AccountStore {
  return {
    async getUsuario(uid) {
      const s = await db().collection(COL_USUARIOS).doc(uid).get();
      return s.exists ? ({ ...(s.data() as Omit<Usuario, "uid">), uid: s.id } as Usuario) : null;
    },

    async getNegocio(id) {
      const s = await db().collection(COL_NEGOCIOS).doc(id).get();
      return s.exists ? ({ ...(s.data() as Omit<Negocio, "id">), id: s.id } as Negocio) : null;
    },

    async getConfig() {
      const s = await db().collection(COL_CONFIG).doc("planes").get();
      return mezclarConfig(s.exists ? (s.data() as Partial<PlanesConfig>) : null);
    },

    async reservarUso(negocioId, dia, c, unidades, tope) {
      const ref = db().collection(COL_USO).doc(idUso(negocioId, dia));
      // Transacción: leer, comparar con el tope y guardar, sin que otra petición se meta en medio
      return db().runTransaction(async (t) => {
        const s = await t.get(ref);
        const actual = numero(s.data()?.[c]);
        if (actual + unidades > tope) return false;
        t.set(ref, { [c]: actual + unidades }, { merge: true });
        return true;
      });
    },

    async devolverUso(negocioId, dia, c, unidades) {
      const ref = db().collection(COL_USO).doc(idUso(negocioId, dia));
      await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists) return;
        const actual = numero(s.data()?.[c]);
        if (actual >= unidades) {
          t.update(ref, { [c]: FieldValue.increment(-unidades) });
        } else {
          t.update(ref, { [c]: 0 }); // nunca debajo de 0
        }
      });
    },

    async crearNegocio(n, id) {
      const col = db().collection(COL_NEGOCIOS);
      const ref = id ? col.doc(id) : col.doc();
      if (!id) {
        await ref.set(n);
        return { ...n, id: ref.id };
      }
      try {
        // create() falla si ya existe: un doble clic no produce dos negocios
        await ref.create(n);
        return { ...n, id: ref.id };
      } catch (e) {
        if ((e as { code?: unknown }).code === 6) return null; // ALREADY_EXISTS
        throw e;
      }
    },

    async usuarioPorEmail(email) {
      const q = await db()
        .collection(COL_USUARIOS)
        .where("email", "==", email.toLowerCase())
        .limit(1)
        .get();
      const d = q.docs[0];
      return d ? ({ ...(d.data() as Omit<Usuario, "uid">), uid: d.id } as Usuario) : null;
    },

    async crearUsuario(u) {
      const { uid, ...datos } = u;
      try {
        // create() falla si el documento ya existe: dos peticiones a la vez no duplican
        await db().collection(COL_USUARIOS).doc(uid).create({ ...datos, email: datos.email.toLowerCase() });
        return true;
      } catch (e) {
        if ((e as { code?: unknown }).code === 6) return false; // ALREADY_EXISTS
        throw e;
      }
    },

    async getInvitacion(email) {
      const s = await db().collection(COL_INVITACIONES).doc(email.toLowerCase()).get();
      return s.exists ? (s.data() as Invitacion) : null;
    },

    async crearInvitacion(email, inv) {
      await db().collection(COL_INVITACIONES).doc(email.toLowerCase()).set(inv);
    },

    async borrarInvitacion(email) {
      await db().collection(COL_INVITACIONES).doc(email.toLowerCase()).delete();
    },

    async listarInvitaciones(negocioId) {
      const q = await db().collection(COL_INVITACIONES).where("negocioId", "==", negocioId).get();
      return q.docs.map((d) => d.id).sort();
    },

    async unirMiembro(negocioId, uid, max) {
      const ref = db().collection(COL_NEGOCIOS).doc(negocioId);
      return db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists) return false;
        const miembros = ((s.data() as Negocio).miembros ?? []) as string[];
        if (miembros.includes(uid)) return true;
        if (max !== undefined && miembros.length >= max) return false;
        t.update(ref, { miembros: [...miembros, uid], actualizado: Date.now() });
        return true;
      });
    },

    async quitarMiembro(negocioId, uid) {
      const refN = db().collection(COL_NEGOCIOS).doc(negocioId);
      const refU = db().collection(COL_USUARIOS).doc(uid);
      await db().runTransaction(async (t) => {
        const u = await t.get(refU);
        t.update(refN, { miembros: FieldValue.arrayRemove(uid), actualizado: Date.now() });
        // Solo se borra el usuario si de verdad es de este negocio
        if (u.exists && u.data()?.negocioId === negocioId) t.delete(refU);
      });
    },

    async getUso(negocioId, dia) {
      const s = await db().collection(COL_USO).doc(idUso(negocioId, dia)).get();
      const d = s.data() ?? {};
      return {
        textos: numero(d.textos),
        imagenes: numero(d.imagenes),
        voces: numero(d.voces),
        subtitulos: numero(d.subtitulos),
      };
    },

    async listarNegocios() {
      const q = await db().collection(COL_NEGOCIOS).get();
      return q.docs
        .map((d) => ({ ...(d.data() as Omit<Negocio, "id">), id: d.id }) as Negocio)
        .sort((a, b) => b.creado - a.creado);
    },

    async actualizarNegocio(id, cambios) {
      const { id: _id, ...datos } = cambios; // el id nunca se guarda dentro del documento
      void _id;
      await db().collection(COL_NEGOCIOS).doc(id).update(datos);
    },

    async registrarPagoManual(p) {
      const { id, ...datos } = p;
      // Firestore no acepta valores undefined
      const limpio = Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined));
      await db().collection(COL_PAGOS_MANUALES).doc(id).set(limpio);
    },

    async listarPagosManuales(negocioId) {
      const q = await db().collection(COL_PAGOS_MANUALES).where("negocioId", "==", negocioId).get();
      return q.docs
        .map((d) => ({ ...(d.data() as Omit<PagoManual, "id">), id: d.id }) as PagoManual)
        .sort((a, b) => b.fecha - a.fecha);
    },
  };
}
