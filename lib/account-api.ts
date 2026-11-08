import "server-only";
import { firestoreStore, type AccountStore, type Usuario } from "./account-store";
import { stripeModoLive } from "./stripe-server";
import {
  estadoEfectivo,
  inicioMesSiguienteChicago,
  mesChicago,
  type Contador,
  type Efectivo,
  type Herramienta,
  type Negocio,
  type PaqueteId,
  type Saldo,
} from "./plans";

// Lo que hacen las rutas /api/cuenta. Son funciones sin Request/Response para poder probarlas;
// las rutas solo verifican la sesión y las envuelven.

// stripeLive: modo de las claves de Stripe (si no se pasa, se mira STRIPE_SECRET_KEY).
export type DepsCuenta = { store?: AccountStore; now?: number; stripeLive?: boolean };
const modo = (deps: DepsCuenta) => ({ stripeLive: deps.stripeLive ?? stripeModoLive() });

export type Falla = { ok: false; status: number; error: string; codigo?: string };
const falla = (status: number, error: string, codigo?: string): Falla =>
  codigo ? { ok: false, status, error, codigo } : { ok: false, status, error };

const CEROS: Record<Contador, number> = { textos: 0, imagenes: 0, voces: 0, subtitulos: 0 };

// Solo cuenta como admin quien confirmó su correo: Firebase deja registrar un correo ajeno sin confirmar.
export function esCorreoAdmin(email: string, emailVerified: boolean): boolean {
  if (!emailVerified) return false;
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
      uso: Record<Contador, number>; // del mes
      saldo: Saldo; // paquetes comprados (no vencen)
      reinicio: number; // ms: cuando los contadores del mes vuelven a cero
      paquetes: { id: PaqueteId; monto: number; contenido: Saldo }[]; // los que el plan puede comprar
      esAdmin: boolean;
      esDueno: boolean;
      precios: { basico: number; pro: number };
      // Solo lo ve el dueño. Las invitaciones solo vienen si se piden (GET /api/cuenta?equipo=1).
      equipo?: { miembros: number; invitaciones?: string[] };
    };

export async function obtenerCuenta(
  uid: string,
  email: string,
  emailVerified: boolean,
  deps: DepsCuenta = {},
  opciones: { equipo?: boolean } = {},
): Promise<EstadoCuenta> {
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const esAdmin = esCorreoAdmin(email, emailVerified);

  const usuario = await store.getUsuario(uid);
  if (!usuario) return { usuario: null, esAdmin };
  const negocio = await store.getNegocio(usuario.negocioId);
  if (!negocio) return { usuario: null, esAdmin };

  const cfg = await store.getConfig();
  const efectivo = estadoEfectivo(negocio, ahora, modo(deps));
  const plan = efectivo.plan;
  const uso = await store.getUso(negocio.id, mesChicago(ahora));
  const esDueno = negocio.duenoUid === uid;

  const cuenta: EstadoCuenta = {
    usuario,
    negocio,
    efectivo,
    herramientas: plan ? [...cfg.herramientas[plan]] : [],
    limites: plan ? { ...cfg.limitesMes[plan] } : { ...CEROS },
    uso,
    saldo: { ...negocio.paquetes },
    reinicio: inicioMesSiguienteChicago(ahora),
    paquetes: plan === "basico" || plan === "pro"
      ? (Object.entries(cfg.paquetes) as [PaqueteId, (typeof cfg.paquetes)[PaqueteId]][])
          .filter(([, p]) => p.planes.includes(plan))
          .map(([id, p]) => ({ id, monto: p.monto, contenido: { ...p.contenido } }))
      : [],
    esAdmin,
    esDueno,
    precios: { basico: cfg.precios.basico.monto, pro: cfg.precios.pro.monto },
  };
  if (esDueno) {
    // Las invitaciones pendientes cuestan una consulta más: solo cuando las pide «Mi cuenta»
    cuenta.equipo = opciones.equipo
      ? { miembros: negocio.miembros.length, invitaciones: await store.listarInvitaciones(negocio.id) }
      : { miembros: negocio.miembros.length };
  }
  return cuenta;
}

export async function crearCuenta(
  uid: string,
  email: string,
  emailVerified: boolean,
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
    // Solo un correo confirmado puede ocupar el lugar de una invitación
    if (!emailVerified) {
      return falla(
        403,
        "Confirma tu correo para unirte al equipo. Te enviamos un enlace a tu correo.",
        "VERIFICAR_CORREO",
      );
    }
    // Solo se entra a un equipo de un negocio que hoy es Pro (si bajó a Básico, o está en prueba, no)
    const delEquipo = await store.getNegocio(inv.negocioId);
    const esPro = !!delEquipo && estadoEfectivo(delEquipo, ahora, modo(deps)).plan === "pro";
    const unido = esPro && (await store.unirMiembro(inv.negocioId, uid, cfg.personas.pro));
    if (unido) {
      const u: Usuario = { uid, email: correo, negocioId: inv.negocioId, rol: "miembro", creado: ahora };
      const creado = await store.crearUsuario(u);
      if (!creado) {
        const ya = await store.getUsuario(uid);
        // Perdió la carrera: si su usuario es de otro negocio, deshace el lugar que acababa de tomar
        if (ya && ya.negocioId !== inv.negocioId) await store.quitarMiembro(inv.negocioId, uid);
        return { ok: true, usuario: ya ?? u };
      }
      await store.borrarInvitacion(correo);
      return { ok: true, usuario: u };
    }
    // Sin cupo, el negocio ya no es Pro o ya no existe: sigue como persona nueva con su propio negocio
  }

  const nombre = (nombreNegocio ?? "").trim();
  if (nombre.length < 1 || nombre.length > 80) {
    return falla(400, "Escribe el nombre de tu negocio (máximo 80 caracteres).");
  }
  // Id fijo por persona: un doble clic no puede producir dos negocios
  const idNegocio = `n_${uid}`;
  await store.crearNegocio(
    {
    nombre,
    duenoUid: uid,
    miembros: [uid],
    plan: "pro",
    estado: "prueba",
    pruebaHasta: ahora + cfg.pruebaMinutos * 60000, // siempre: sin esto la prueba no vencería nunca
    origen: null,
    creado: ahora,
    actualizado: ahora,
    },
    idNegocio,
  );
  const u: Usuario = { uid, email: correo, negocioId: idNegocio, rol: "dueno", creado: ahora };
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
  if (estadoEfectivo(negocio, ahora, modo(deps)).plan !== "pro") return falla(403, "Invitar a tu equipo es del plan Pro.");

  const correo = String(email ?? "").trim().toLowerCase();
  if (!CORREO.test(correo) || correo.length > 254) return falla(400, "Escribe un correo válido.");

  const cfg = await store.getConfig();
  const pendientes = await store.listarInvitaciones(negocio.id);
  if (pendientes.includes(correo) || (await store.getInvitacion(correo))) {
    return falla(400, "Esa persona ya está en tu equipo o ya tiene una invitación.");
  }
  const existente = await store.usuarioPorEmail(correo);
  if (existente) {
    return existente.negocioId === negocio.id
      ? falla(400, "Esa persona ya está en tu equipo o ya tiene una invitación.")
      : falla(400, "Esa persona ya tiene su propia cuenta en Studio.");
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

export async function cancelarInvitacion(
  uid: string,
  email: string,
  deps: DepsCuenta = {},
): Promise<{ ok: true } | Falla> {
  const store = deps.store ?? firestoreStore();

  const usuario = await store.getUsuario(uid);
  const negocio = usuario ? await store.getNegocio(usuario.negocioId) : null;
  if (!usuario || !negocio) return falla(403, "Crea tu cuenta para empezar.");
  if (negocio.duenoUid !== uid) return falla(403, "Solo el dueño del negocio puede cancelar invitaciones.");

  const correo = String(email ?? "").trim().toLowerCase();
  const inv = correo ? await store.getInvitacion(correo) : null;
  // Solo invitaciones de este negocio
  if (!inv || inv.negocioId !== negocio.id) return falla(404, "No encontramos esa invitación.");

  await store.borrarInvitacion(correo);
  return { ok: true };
}
