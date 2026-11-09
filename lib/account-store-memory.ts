// Versión falsa del AccountStore, guardada en memoria. Solo para pruebas.
import type {
  AccountStore,
  ConfigParcial,
  Invitacion,
  MovimientoPaquete,
  PagoManual,
  Reserva,
  Usuario,
  Uso,
} from "./account-store";
import type { Contador, Negocio, PlanesConfig } from "./plans";
import { aplicarCambios, cantidadSegura, mezclarConfig, repartirReserva, sumarSaldo } from "./plans";

export type SemillaMemoria = {
  usuarios?: Usuario[];
  negocios?: Negocio[];
  uso?: Record<string, Partial<Uso>>; // clave: "{negocioId}_{AAAA-MM}"
  config?: Partial<PlanesConfig>;
  invitaciones?: Record<string, Invitacion>; // clave: correo en minúsculas
};

export type MemoryStore = AccountStore & {
  // Para revisar los contadores en las pruebas
  uso(negocioId: string, mes: string): Uso;
  cantidadNegocios(): number;
  // Para revisar en las pruebas si un aviso de Stripe quedó marcado
  eventoMarcado(id: string): boolean;
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
  const movimientos: MovimientoPaquete[] = [];
  const invitaciones = new Map<string, Invitacion>(
    Object.entries(seed.invitaciones ?? {}).map(([k, v]) => [k.toLowerCase(), { ...v }]),
  );
  let contador = 0;

  const fila = (negocioId: string, mes: string) => {
    const k = `${negocioId}_${mes}`;
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
    reservarUso(negocioId, mes, c: Contador, unidades, tope) {
      return enCola(async (): Promise<Reserva | null> => {
        const n = negocios.get(negocioId);
        if (!n) return null;
        const actual = fila(negocioId, mes)[c];
        const saldo = cantidadSegura(n.paquetes?.[c]);
        await pausa(); // simula la ida y vuelta a la base entre leer y escribir
        const r = repartirReserva(actual, tope, saldo, unidades);
        if (!r) return null;
        fila(negocioId, mes)[c] = actual + r.delMes;
        if (r.delSaldo > 0) n.paquetes = sumarSaldo(n.paquetes, { [c]: r.delSaldo }, -1);
        return r;
      });
    },
    devolverUso(negocioId, mes, c: Contador, r) {
      return enCola(async () => {
        const f = fila(negocioId, mes);
        f[c] = Math.max(0, f[c] - r.delMes);
        const n = negocios.get(negocioId);
        if (n && r.delSaldo > 0) n.paquetes = sumarSaldo(n.paquetes, { [c]: r.delSaldo }, 1);
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
    async getUso(negocioId, mes) {
      return { ...(uso.get(`${negocioId}_${mes}`) ?? vacio()) };
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
    async registrarMovimiento(m) {
      movimientos.push(copia(m));
    },
    async listarMovimientos(negocioId) {
      return movimientos.filter((m) => m.negocioId === negocioId).map(copia).sort((a, b) => b.fecha - a.fecha);
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
        // Como merge:true de Firestore: un paquete parcial (p. ej. solo stripePriceId) no borra el resto
        paquetes: {
          creativo: { ...config.paquetes.creativo, ...p.paquetes?.creativo },
          voz: { ...config.paquetes.voz, ...p.paquetes?.voz },
        },
      });
    },
    async negocioPorCustomer(customerId) {
      for (const n of negocios.values()) if (n.stripe?.customerId === customerId) return copia(n);
      return null;
    },
    modificarNegocio(id, fn, opciones) {
      return enCola(async () => {
        const eventoId = opciones?.eventoId;
        if (eventoId && eventos.has(eventoId)) return "duplicado" as const;
        const n = negocios.get(id);
        if (!n) return "no_existe" as const;
        // Si fn falla no se marca ni se cambia nada (como una transacción que no se confirmó)
        const cambios = fn(copia(n));
        if (eventoId) eventos.add(eventoId);
        if (cambios) {
          // Como en Firestore: null en un campo borrable (manualSiguiente) lo borra
          const { id: _id, ...datos } = copia(cambios);
          void _id;
          negocios.set(id, aplicarCambios(n, datos));
        }
        return "ok" as const;
      });
    },
    eventoMarcado(id: string) {
      return eventos.has(id);
    },
    cantidadNegocios() {
      return negocios.size;
    },
    uso(negocioId, mes) {
      return { ...fila(negocioId, mes) };
    },
  };
}
