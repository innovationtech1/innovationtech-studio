import "server-only";
import { firestoreStore, type AccountStore } from "./account-store";
import { stripeModoLive } from "./stripe-server";
import { verifyIdToken } from "./verify-token";
import {
  estadoEfectivo,
  limiteMes,
  mesChicago,
  puedeUsar,
  type Contador,
  type Herramienta,
  type Negocio,
  type Plan,
} from "./plans";

// Guardián del servidor: cada ruta /api de IA lo llama antes de trabajar.
// Revisa la sesión, el estado del negocio, el plan y el límite diario.

export function cuentasActivas(): boolean {
  return process.env.STUDIO_CUENTAS === "on";
}

export type CodigoAcceso = "SESION" | "PAUSADO" | "SIN_PLAN" | "PLAN" | "CLAVE_PROPIA" | "LIMITE";

// `negocio` y `plan` son null SOLO cuando las cuentas están apagadas (modo demo).
export type Acceso =
  | {
      ok: true;
      uid: string;
      negocio: Negocio | null;
      plan: Plan | null;
      contado: boolean;
      devolver: () => Promise<void>;
    }
  | { ok: false; status: number; codigo: CodigoAcceso; mensaje: string };

export type OpcionesAcceso = {
  herramienta: Herramienta;
  contador?: Contador;
  unidades?: number;
  clavePropia: boolean;
};

export type DepsAcceso = {
  store?: AccountStore;
  verify?: (token: string) => Promise<{ uid: string; email: string; emailVerified: boolean }>;
  now?: number;
  stripeLive?: boolean; // modo de las claves de Stripe (si no se pasa, se mira STRIPE_SECRET_KEY)
};

const NOMBRE_CONTADOR: Record<Contador, string> = {
  textos: "mensajes y textos",
  imagenes: "imágenes",
  voces: "voces",
  subtitulos: "subtítulos",
};

const nada = async () => {};

function falla(status: number, codigo: CodigoAcceso, mensaje: string): Acceso {
  return { ok: false, status, codigo, mensaje };
}

function tokenDe(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)\s*$/i.exec(h);
  return m ? m[1] : null;
}

export async function requireAccess(
  req: Request,
  o: OpcionesAcceso,
  deps: DepsAcceso = {},
): Promise<Acceso> {
  // Cuentas apagadas: todo sigue como en el modo demo, sin leer nada.
  if (!cuentasActivas()) {
    return { ok: true, uid: "", negocio: null, plan: null, contado: false, devolver: nada };
  }

  const store = deps.store ?? firestoreStore();
  const verify = deps.verify ?? ((t: string) => verifyIdToken(t));
  const ahora = deps.now ?? Date.now();

  // 1) Sesión
  const token = tokenDe(req);
  if (!token) return falla(401, "SESION", "Inicia sesión para continuar.");
  let uid: string;
  try {
    uid = (await verify(token)).uid;
  } catch {
    return falla(401, "SESION", "Inicia sesión para continuar.");
  }

  // 2) Usuario y negocio
  const usuario = await store.getUsuario(uid);
  if (!usuario) return falla(403, "SIN_PLAN", "Crea tu cuenta para empezar.");
  const negocio = await store.getNegocio(usuario.negocioId);
  if (!negocio) return falla(403, "SIN_PLAN", "Crea tu cuenta para empezar.");

  // 3) Estado del negocio
  const ef = estadoEfectivo(negocio, ahora, { stripeLive: deps.stripeLive ?? stripeModoLive() });
  if (ef.estado === "pausado") {
    return falla(403, "PAUSADO", "Tu cuenta está en pausa. Paga para reactivarla.");
  }
  if (ef.estado === "sin_plan" || !ef.plan) {
    return falla(403, "SIN_PLAN", "Tu prueba terminó. Elige un plan para seguir creando.");
  }
  const plan = ef.plan;
  // Bajó de Pro a Básico con equipo: solo el dueño sigue usando el plan (Básico es para 1 persona)
  if (negocio.duenoUid !== uid && plan !== "pro") {
    return falla(403, "PLAN", "Tu plan actual es para 1 persona. Pide al dueño que pase a Pro.");
  }

  // 4) Herramienta
  if (o.herramienta === "video_ia" && !o.clavePropia) {
    return falla(403, "CLAVE_PROPIA", "El video con IA necesita tu propia clave de Replicate.");
  }
  const cfg = await store.getConfig();
  if (!puedeUsar(cfg, plan, o.herramienta)) {
    return falla(403, "PLAN", "Esta herramienta es del plan Pro. Mejora a Pro para usarla.");
  }

  // 5) Límite diario (con clave propia no se cuenta)
  if (!o.contador || o.clavePropia) {
    return { ok: true, uid, negocio, plan, contado: false, devolver: nada };
  }
  const contador = o.contador;
  // Entero de 1 o más: nunca un número negativo que bajaría el contador
  const unidades = Number.isFinite(o.unidades) ? Math.max(1, Math.ceil(o.unidades as number)) : 1;
  const tope = limiteMes(cfg, plan, contador);
  const mes = mesChicago(ahora);
  const reserva = await store.reservarUso(negocio.id, mes, contador, unidades, tope);
  if (!reserva) {
    const mensaje =
      plan === "prueba"
        ? "Llegaste al límite de la prueba. Elige un plan para seguir creando."
        : `Llegaste al límite de hoy (${tope} ${NOMBRE_CONTADOR[contador]}). Se reinicia a medianoche. Puedes pasarte a Pro o conectar tu propia cuenta para usarlo sin límite.`;
    return falla(429, "LIMITE", mensaje);
  }

  // devolver() regresa exactamente lo reservado, una sola vez
  let devuelto = false;
  const devolver = async () => {
    if (devuelto) return;
    devuelto = true;
    await store.devolverUso(negocio.id, mes, contador, reserva);
  };
  return { ok: true, uid, negocio, plan, contado: true, devolver };
}

export function jsonAcceso(a: Extract<Acceso, { ok: false }>): Response {
  return Response.json(
    { error: a.mensaje, codigo: a.codigo },
    { status: a.status, headers: { "Cache-Control": "no-store" } },
  );
}
