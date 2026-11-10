import "server-only";
import { firestoreStore, type AccountStore, type Reserva } from "./account-store";
import { stripeModoLive } from "./stripe-server";
import { verifyIdToken } from "./verify-token";
import { descifrarClave, llaveDeEntorno, type ClaveIA } from "./cifrado";
import {
  estadoEfectivo,
  inicioMesSiguienteChicago,
  limiteMes,
  mesChicago,
  puedeUsar,
  type Contador,
  type Herramienta,
  type Negocio,
  type Plan,
} from "./plans";

// Guardián del servidor: cada ruta /api de IA lo llama antes de trabajar.
// Revisa la sesión, el estado del negocio, el plan y el límite del mes (más el saldo de paquetes).

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
      // Lo reservado (mes y saldo) y su mes, cuando se contó: para devolverlo después por partes (tomas con IA).
      reserva?: Reserva;
      mes?: string;
      // La clave de Cloudflare guardada del negocio, ya descifrada (solo si la ruta usa Cloudflare
      // y el pedido no trae la del navegador). Pásala a getCreds. Nunca se devuelve al navegador.
      cfGuardada?: ClaveIA;
    }
  | { ok: false; status: number; codigo: CodigoAcceso; mensaje: string };

export type OpcionesAcceso = {
  herramienta: Herramienta;
  contador?: Contador;
  unidades?: number;
  clavePropia: boolean;
  // La ruta va a usar Cloudflare (no Replicate ni Anthropic): solo así cuenta la clave guardada del negocio.
  cloudflare?: boolean;
};

export type DepsAcceso = {
  store?: AccountStore;
  verify?: (token: string) => Promise<{ uid: string; email: string; emailVerified: boolean }>;
  now?: number;
  stripeLive?: boolean; // modo de las claves de Stripe (si no se pasa, se mira STRIPE_SECRET_KEY)
  llave?: Buffer | null; // llave de cifrado de las claves (si no se pasa, STUDIO_CLAVES_SECRETO; null = no hay)
};

const NOMBRE_CONTADOR: Record<Contador, string> = {
  textos: "mensajes y textos",
  imagenes: "imágenes",
  voces: "voces",
  subtitulos: "subtítulos",
  tomas_ia: "tomas con IA",
};

// «1 de diciembre»: día y mes en español, en la hora de Chicago
const formatoFecha = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Chicago",
  day: "numeric",
  month: "long",
});

const nada = async () => {};

function falla(status: number, codigo: CodigoAcceso, mensaje: string): Acceso {
  return { ok: false, status, codigo, mensaje };
}

function tokenDe(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)\s*$/i.exec(h);
  return m ? m[1] : null;
}

// Descifra la clave guardada del negocio. null (con un aviso sin datos sensibles) si falta la llave,
// no hay documento o no se puede leer.
async function leerGuardada(store: AccountStore, negocioId: string, llave: Buffer | null): Promise<ClaveIA | null> {
  try {
    const doc = llave ? await store.leerClaveIA(negocioId) : null;
    const clave = llave && doc ? descifrarClave(doc, llave) : null;
    if (clave) return clave;
    console.error(
      `Clave de Cloudflare del negocio ${negocioId} no disponible (${!llave ? "SIN_LLAVE" : !doc ? "SIN_DOCUMENTO" : "ILEGIBLE"}): se usa la cuenta de InnovationTECH.`,
    );
  } catch {
    console.error(`Clave de Cloudflare del negocio ${negocioId} no disponible (ERROR_LECTURA): se usa la cuenta de InnovationTECH.`);
  }
  return null;
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
  // video_ia tiene dos caminos: las tomas con IA (contador tomas_ia, cuenta de InnovationTECH) y el
  // flujo viejo de Replicate, que sigue siendo solo de Pro y con la clave propia del cliente.
  const replicate = o.herramienta === "video_ia" && o.contador !== "tomas_ia";
  if (replicate && !o.clavePropia) {
    return falla(403, "CLAVE_PROPIA", "El video con IA necesita tu propia clave de Replicate.");
  }
  const cfg = await store.getConfig();
  if (!puedeUsar(cfg, plan, o.herramienta) || (replicate && plan !== "pro")) {
    return falla(403, "PLAN", "Esta herramienta es del plan Pro. Mejora a Pro para usarla.");
  }

  // 5) Clave de Cloudflare guardada del negocio (después del plan: la clave propia no salta el plan).
  // Los encabezados del navegador ganan; si no se puede leer, sigue con la cuenta de InnovationTECH y límites.
  let cfGuardada: ClaveIA | undefined;
  if (o.cloudflare && !o.clavePropia && negocio.iaPropia) {
    cfGuardada = (await leerGuardada(store, negocio.id, deps.llave !== undefined ? deps.llave : llaveDeEntorno())) ?? undefined;
  }
  const clavePropia = o.clavePropia || !!cfGuardada;

  // 6) Límite del mes y saldo (con clave propia no se cuenta)
  if (!o.contador || clavePropia) {
    return { ok: true, uid, negocio, plan, contado: false, devolver: nada, ...(cfGuardada ? { cfGuardada } : {}) };
  }
  const contador = o.contador;
  // Entero de 1 o más: nunca un número negativo que bajaría el contador
  const unidades = Number.isFinite(o.unidades) ? Math.max(1, Math.ceil(o.unidades as number)) : 1;
  const tope = limiteMes(cfg, plan, contador);
  const mes = mesChicago(ahora);
  const reserva = await store.reservarUso(negocio.id, mes, contador, unidades, tope);
  if (!reserva) {
    const fecha = formatoFecha.format(inicioMesSiguienteChicago(ahora));
    const mensaje =
      plan === "prueba"
        ? "Llegaste al límite de la prueba. Elige un plan para seguir creando."
        : contador === "tomas_ia" && tope === 0
          ? // Básico no trae tomas al mes: «espera al día 1» no aplica
            negocio.duenoUid === uid
            ? "Tu plan no incluye tomas con IA. Compra el paquete Video en Mi cuenta para usarlas."
            : "Tu plan no incluye tomas con IA. Pídele al dueño de la cuenta que compre el paquete Video."
          : negocio.duenoUid === uid
          ? `Se acabó lo incluido este mes (${tope} ${NOMBRE_CONTADOR[contador]}). Compra un paquete o espera al ${fecha}.`
          : // Un miembro no puede comprar: solo el dueño paga
            `Se acabó lo incluido este mes (${tope} ${NOMBRE_CONTADOR[contador]}). Pídele al dueño de la cuenta que compre un paquete o espera al ${fecha}.`;
    return falla(429, "LIMITE", mensaje);
  }

  // devolver() regresa exactamente lo reservado, una sola vez
  let devuelto = false;
  const devolver = async () => {
    if (devuelto) return;
    devuelto = true;
    await store.devolverUso(negocio.id, mes, contador, reserva);
  };
  return { ok: true, uid, negocio, plan, contado: true, devolver, reserva, mes };
}

export function jsonAcceso(a: Extract<Acceso, { ok: false }>): Response {
  return Response.json(
    { error: a.mensaje, codigo: a.codigo },
    { status: a.status, headers: { "Cache-Control": "no-store" } },
  );
}
