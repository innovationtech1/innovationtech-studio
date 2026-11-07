// Versión falsa del AccountStore, guardada en memoria. Solo para pruebas.
import type { AccountStore, ConfigParcial, Invitacion, PagoManual, Usuario, Uso } from "./account-store";
import type { Contador, Negocio, PlanesConfig } from "./plans";
import { mezclarConfig } from "./plans";

export type SemillaMemoria = {
  usuarios?: Usuario[];
  negocios?: Negocio[];
  uso?: Record<string, Partial<Uso>>; // clave: "{negocioId}_{AAAA-MM-DD}"
  config?: Partial<PlanesConfig>;
  invitaciones?: Record<string, Invitacion>; // clave: correo en minúsculas
};

export type MemoryStore = AccountStore & {
  // Para revisar los contadores en las pruebas
  uso(negocioId: string, dia: string): Uso;
  cantidadNegocios(): number;
};

const vacio = (): Uso => ({ textos: 0, imagenes: 0, voces: 0, subtitulos: 0 });
const copia = <T>(v: T): T => structuredClone(v);

export function memoryStore(seed: SemillaMemoria = {}): MemoryStore {
  const usuarios = new Map((seed.usuarios ?? []).map((u) => [u.uid, copia(u)]));
  const negocios = new Map((seed.negocios ?? []).map((n) => [n.id, copia(n)]));
  const uso = new Map<string, Uso>(
    Object.entries(seed.uso ?? {}).map(([k, v]) => [k, { ...vacio(), ...v }]),
  );
  let config = mezclarConfig(seed.config);
  const eventos = new Set<string>();
  const pagos: PagoManual[] = [];
  const invitaciones = new Map<string, Invitacion>(
    Object.entries(seed.invitaciones ?? {}).map(([k, v]) => [k.toLowerCase(), { ...v }]),
  );
  let contador = 0;

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
    async crearNegocio(n, id) {
      if (id && negocios.has(id)) return null;
      const nuevo: Negocio = { ...copia(n), id: id ?? `neg${++contador}` };
      negocios.set(nuevo.id, nuevo);
      return copia(nuevo);
    },
    async crearUsuario(u) {
      if (usuarios.has(u.uid)) return false;
      usuarios.set(u.uid, { ...copia(u), email: u.email.toLowerCase() });
      return true;
    },
    async usuarioPorEmail(email) {
      const e = email.toLowerCase();
      for (const u of usuarios.values()) if (u.email.toLowerCase() === e) return copia(u);
      return null;
    },
    async getInvitacion(email) {
      const i = invitaciones.get(email.toLowerCase());
      return i ? { ...i } : null;
    },
    async crearInvitacion(email, inv) {
      invitaciones.set(email.toLowerCase(), { ...inv });
    },
    async borrarInvitacion(email) {
      invitaciones.delete(email.toLowerCase());
    },
    async listarInvitaciones(negocioId) {
      return [...invitaciones].filter(([, i]) => i.negocioId === negocioId).map(([e]) => e).sort();
    },
    async unirMiembro(negocioId, uid, max) {
      const n = negocios.get(negocioId);
      if (!n) return false;
      if (n.miembros.includes(uid)) return true;
      if (max !== undefined && n.miembros.length >= max) return false;
      n.miembros.push(uid);
      return true;
    },
    async quitarMiembro(negocioId, uid) {
      const n = negocios.get(negocioId);
      if (n) n.miembros = n.miembros.filter((m) => m !== uid);
      if (usuarios.get(uid)?.negocioId === negocioId) usuarios.delete(uid);
    },
    async getUso(negocioId, dia) {
      return { ...(uso.get(`${negocioId}_${dia}`) ?? vacio()) };
    },
    async listarNegocios() {
      return [...negocios.values()].map(copia).sort((a, b) => b.creado - a.creado);
    },
    async actualizarNegocio(id, cambios) {
      const n = negocios.get(id);
      if (!n) throw new Error(`No existe el negocio ${id}`);
      const { id: _id, ...datos } = copia(cambios);
      void _id;
      Object.assign(n, datos);
    },
    async registrarPagoManual(p) {
      pagos.push(copia(p));
    },
    async listarPagosManuales(negocioId) {
      return pagos.filter((p) => p.negocioId === negocioId).map(copia).sort((a, b) => b.fecha - a.fecha);
    },
    async guardarConfig(parcial: ConfigParcial) {
      const p = copia(parcial);
      config = mezclarConfig({
        ...config,
        ...p,
        precios: {
          basico: { ...config.precios.basico, ...p.precios?.basico },
          pro: { ...config.precios.pro, ...p.precios?.pro },
        },
      });
    },
    async negocioPorCustomer(customerId) {
      for (const n of negocios.values()) if (n.stripe?.customerId === customerId) return copia(n);
      return null;
    },
    async eventoProcesado(id) {
      if (eventos.has(id)) return true;
      eventos.add(id);
      return false;
    },
    async olvidarEvento(id) {
      eventos.delete(id);
    },
    modificarNegocio(id, fn) {
      return enCola(async () => {
        const n = negocios.get(id);
        if (!n) return false;
        const cambios = fn(copia(n));
        if (cambios) {
          const { id: _id, ...datos } = copia(cambios);
          void _id;
          Object.assign(n, datos);
        }
        return true;
      });
    },
    cantidadNegocios() {
      return negocios.size;
    },
    uso(negocioId, dia) {
      return { ...fila(negocioId, dia) };
    },
  };
}
