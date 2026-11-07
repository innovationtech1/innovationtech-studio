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
}

export const COL_USUARIOS = "studio_usuarios";
export const COL_NEGOCIOS = "studio_negocios";
export const COL_USO = "studio_uso";
export const COL_CONFIG = "studio_config";

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
  };
}
