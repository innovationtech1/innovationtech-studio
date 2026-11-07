import "server-only";
import { firestoreStore, type AccountStore, type Usuario } from "./account-store";
import {
  diaChicago,
  estadoEfectivo,
  type Contador,
  type Efectivo,
  type Herramienta,
  type Negocio,
} from "./plans";

// Lo que hacen las rutas /api/cuenta. Son funciones sin Request/Response para poder probarlas;
// las rutas solo verifican la sesión y las envuelven.

export type DepsCuenta = { store?: AccountStore; now?: number };

export type Falla = { ok: false; status: number; error: string };
const falla = (status: number, error: string): Falla => ({ ok: false, status, error });

const CEROS: Record<Contador, number> = { textos: 0, imagenes: 0, voces: 0, subtitulos: 0 };

export function esCorreoAdmin(email: string): boolean {
  const lista = (process.env.STUDIO_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return lista.includes(email.trim().toLowerCase());
}

export type EstadoCuenta =
  | { usuario: null; esAdmin: boolean }
  | {
      usuario: Usuario;
      negocio: Negocio;
      efectivo: Efectivo;
      herramientas: Herramienta[];
      limites: Record<Contador, number>;
      uso: Record<Contador, number>;
      esAdmin: boolean;
      esDueno: boolean;
      precios: { basico: number; pro: number };
      // Solo lo ve el dueño
      equipo?: { miembros: number; invitaciones: string[] };
    };

export async function obtenerCuenta(uid: string, email: string, deps: DepsCuenta = {}): Promise<EstadoCuenta> {
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const esAdmin = esCorreoAdmin(email);

  const usuario = await store.getUsuario(uid);
  if (!usuario) return { usuario: null, esAdmin };
  const negocio = await store.getNegocio(usuario.negocioId);
  if (!negocio) return { usuario: null, esAdmin };

  const cfg = await store.getConfig();
  const efectivo = estadoEfectivo(negocio, ahora);
  const plan = efectivo.plan;
  const uso = await store.getUso(negocio.id, diaChicago(ahora));
  const esDueno = negocio.duenoUid === uid;

  const cuenta: EstadoCuenta = {
    usuario,
    negocio,
    efectivo,
    herramientas: plan ? [...cfg.herramientas[plan]] : [],
    limites: plan ? { ...cfg.limites[plan] } : { ...CEROS },
    uso,
    esAdmin,
    esDueno,
    precios: { basico: cfg.precios.basico.monto, pro: cfg.precios.pro.monto },
  };
  if (esDueno) {
    cuenta.equipo = {
      miembros: negocio.miembros.length,
      invitaciones: await store.listarInvitaciones(negocio.id),
    };
  }
  return cuenta;
}

export async function crearCuenta(
  uid: string,
  email: string,
  nombreNegocio: string,
  deps: DepsCuenta = {},
): Promise<{ ok: true; usuario: Usuario } | Falla> {
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const correo = email.trim().toLowerCase();

  // Si ya tiene cuenta, se devuelve la que hay (no se crea otro negocio)
  const existente = await store.getUsuario(uid);
  if (existente) return { ok: true, usuario: existente };

  const cfg = await store.getConfig();

  // ¿Lo invitaron a un negocio con cupo?
  const inv = correo ? await store.getInvitacion(correo) : null;
  if (inv) {
    const unido = await store.unirMiembro(inv.negocioId, uid, cfg.personas.pro);
    if (unido) {
      const u: Usuario = { uid, email: correo, negocioId: inv.negocioId, rol: "miembro", creado: ahora };
      const creado = await store.crearUsuario(u);
      if (!creado) return { ok: true, usuario: (await store.getUsuario(uid)) ?? u };
      await store.borrarInvitacion(correo);
      return { ok: true, usuario: u };
    }
    // Sin cupo o el negocio ya no existe: sigue como persona nueva con su propio negocio
  }

  const nombre = (nombreNegocio ?? "").trim();
  if (nombre.length < 1 || nombre.length > 80) {
    return falla(400, "Escribe el nombre de tu negocio (máximo 80 caracteres).");
  }
  const negocio = await store.crearNegocio({
    nombre,
    duenoUid: uid,
    miembros: [uid],
    plan: "pro",
    estado: "prueba",
    pruebaHasta: ahora + cfg.pruebaMinutos * 60000, // siempre: sin esto la prueba no vencería nunca
    origen: null,
    creado: ahora,
    actualizado: ahora,
  });
  const u: Usuario = { uid, email: correo, negocioId: negocio.id, rol: "dueno", creado: ahora };
  const creado = await store.crearUsuario(u);
  if (!creado) return { ok: true, usuario: (await store.getUsuario(uid)) ?? u };
  return { ok: true, usuario: u };
}

const CORREO = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

export async function invitar(
  uid: string,
  email: string,
  deps: DepsCuenta = {},
): Promise<{ ok: true; email: string } | Falla> {
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();

  const usuario = await store.getUsuario(uid);
  const negocio = usuario ? await store.getNegocio(usuario.negocioId) : null;
  if (!usuario || !negocio) return falla(403, "Crea tu cuenta para empezar.");
  if (negocio.duenoUid !== uid) return falla(403, "Solo el dueño del negocio puede invitar.");
  if (estadoEfectivo(negocio, ahora).plan !== "pro") return falla(403, "Invitar a tu equipo es del plan Pro.");

  const correo = String(email ?? "").trim().toLowerCase();
  if (!CORREO.test(correo) || correo.length > 254) return falla(400, "Escribe un correo válido.");

  const cfg = await store.getConfig();
  const pendientes = await store.listarInvitaciones(negocio.id);
  if (pendientes.includes(correo) || (await store.getInvitacion(correo))) {
    return falla(400, "Esa persona ya está en tu equipo o ya tiene una invitación.");
  }
  // ¿Ya es miembro? (su correo está en el usuario)
  for (const m of negocio.miembros) {
    if ((await store.getUsuario(m))?.email === correo) {
      return falla(400, "Esa persona ya está en tu equipo o ya tiene una invitación.");
    }
  }
  if (negocio.miembros.length + pendientes.length >= cfg.personas.pro) {
    return falla(400, `Tu plan permite hasta ${cfg.personas.pro} personas.`);
  }

  await store.crearInvitacion(correo, { negocioId: negocio.id, invitadoPor: uid, creado: ahora });
  return { ok: true, email: correo };
}

export async function quitarMiembro(
  uid: string,
  miembroUid: string,
  deps: DepsCuenta = {},
): Promise<{ ok: true } | Falla> {
  const store = deps.store ?? firestoreStore();

  const usuario = await store.getUsuario(uid);
  const negocio = usuario ? await store.getNegocio(usuario.negocioId) : null;
  if (!usuario || !negocio) return falla(403, "Crea tu cuenta para empezar.");
  if (negocio.duenoUid !== uid) return falla(403, "Solo el dueño del negocio puede quitar personas.");
  if (miembroUid === uid) return falla(400, "No puedes quitarte a ti mismo.");
  // Solo gente de este negocio: nunca se toca a nadie de otro
  if (!negocio.miembros.includes(miembroUid)) return falla(404, "Esa persona no está en tu equipo.");

  await store.quitarMiembro(negocio.id, miembroUid);
  return { ok: true };
}
