// Versión falsa del AccountStore, guardada en memoria. Solo para pruebas.
import type { AccountStore, Usuario, Uso } from "./account-store";
import type { Contador, Negocio, PlanesConfig } from "./plans";
import { mezclarConfig } from "./plans";

export type SemillaMemoria = {
  usuarios?: Usuario[];
  negocios?: Negocio[];
  uso?: Record<string, Partial<Uso>>; // clave: "{negocioId}_{AAAA-MM-DD}"
  config?: Partial<PlanesConfig>;
};

export type MemoryStore = AccountStore & {
  // Para revisar los contadores en las pruebas
  uso(negocioId: string, dia: string): Uso;
};

const vacio = (): Uso => ({ textos: 0, imagenes: 0, voces: 0, subtitulos: 0 });
const copia = <T>(v: T): T => structuredClone(v);

export function memoryStore(seed: SemillaMemoria = {}): MemoryStore {
  const usuarios = new Map((seed.usuarios ?? []).map((u) => [u.uid, copia(u)]));
  const negocios = new Map((seed.negocios ?? []).map((n) => [n.id, copia(n)]));
  const uso = new Map<string, Uso>(
    Object.entries(seed.uso ?? {}).map(([k, v]) => [k, { ...vacio(), ...v }]),
  );
  const config = mezclarConfig(seed.config);

  const fila = (negocioId: string, dia: string) => {
    const k = `${negocioId}_${dia}`;
    if (!uso.has(k)) uso.set(k, vacio());
    return uso.get(k)!;
  };

  // Candado: las operaciones de uso van una detrás de otra, como en una transacción
  let cola: Promise<unknown> = Promise.resolve();
  function enCola<T>(fn: () => Promise<T>): Promise<T> {
    const r = cola.then(fn);
    cola = r.catch(() => undefined);
    return r;
  }
  const pausa = () => new Promise<void>((ok) => setTimeout(ok, 0));

  return {
    async getUsuario(uid) {
      const u = usuarios.get(uid);
      return u ? copia(u) : null;
    },
    async getNegocio(id) {
      const n = negocios.get(id);
      return n ? copia(n) : null;
    },
    async getConfig() {
      return copia(config);
    },
    reservarUso(negocioId, dia, c: Contador, unidades, tope) {
      return enCola(async () => {
        const actual = fila(negocioId, dia)[c];
        await pausa(); // simula la ida y vuelta a la base entre leer y escribir
        if (actual + unidades > tope) return false;
        fila(negocioId, dia)[c] = actual + unidades;
        return true;
      });
    },
    devolverUso(negocioId, dia, c: Contador, unidades) {
      return enCola(async () => {
        const f = fila(negocioId, dia);
        f[c] = Math.max(0, f[c] - unidades);
      });
    },
    uso(negocioId, dia) {
      return { ...fila(negocioId, dia) };
    },
  };
}
