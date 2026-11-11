import "server-only";
import { firestoreStore, type AccountStore, type MovimientoPaquete, type PagoManual } from "./account-store";
import { esCorreoAdmin, type Falla } from "./account-api";
import {
  estadoEfectivo,
  esPaquete,
  instanteChicago,
  mesChicago,
  sumarSaldo,
  type Contador,
  type Efectivo,
  type Negocio,
  type PaqueteId,
  type Saldo,
} from "./plans";
import { SUSCRIPCION_VIVA } from "./stripe-events";
import { stripeModoLive } from "./stripe-server";

// Lo que hacen las rutas /api/admin. Son funciones sin Request/Response para poder probarlas.
// Cada una revisa por su cuenta que el correo sea de administrador (además de la ruta).

// stripeLive: modo de las claves de Stripe (si no se pasa, se mira STRIPE_SECRET_KEY).
export type DepsAdmin = { store?: AccountStore; now?: number; stripeLive?: boolean };
const modo = (deps: DepsAdmin) => ({ stripeLive: deps.stripeLive ?? stripeModoLive() });

const falla = (status: number, error: string, codigo?: string): Falla =>
  codigo ? { ok: false, status, error, codigo } : { ok: false, status, error };

const NO_ADMIN = () => falla(403, "No tienes permiso para el panel de administrador.", "NO_ADMIN");
const NO_NEGOCIO = () => falla(404, "No encontramos ese negocio.");

export type FilaNegocio = {
  negocio: Negocio;
  efectivo: Efectivo;
  dueno: string; // correo del dueño ("" si no se encuentra)
  usoMes: Record<Contador, number>;
  saldo: Saldo;
  finTarjeta?: number; // solo con manualSiguiente: cuándo termina el mes pagado con tarjeta (ms)
};

export type DatosActivar = {
  plan: "basico" | "pro";
  hasta: number; // milisegundos
  monto: number;
  metodo: PagoManual["metodo"];
  nota?: string;
};

const METODOS: PagoManual["metodo"][] = ["efectivo", "zelle", "cashapp", "otro"];
const stripeAlDia = (n: Negocio) => n.stripe?.status === "active" || n.stripe?.status === "trialing";

// Convierte «AAAA-MM-DD» en el último segundo (23:59:59) de ese día en Chicago, en milisegundos.
// Así «pagado hasta el 7 de diciembre» cubre todo el 7. Devuelve NaN si la fecha no es válida.
export function finDelDiaChicago(fecha: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return Number.NaN;
  const [y, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (new Date(Date.UTC(y, mes - 1, d, 23, 59, 59)).getUTCMonth() !== mes - 1) return Number.NaN; // p. ej. 31 de febrero
  return instanteChicago(y, mes, d, 23, 59, 59);
}

export async function listar(
  adminEmail: string,
  emailVerified: boolean,
  deps: DepsAdmin = {},
): Promise<{ ok: true; negocios: FilaNegocio[] } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) return NO_ADMIN();
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const mes = mesChicago(ahora);
  const negocios = await store.listarNegocios();
  const filas = await Promise.all(
    negocios.map(async (negocio): Promise<FilaNegocio> => {
      const [dueno, usoMes] = await Promise.all([store.getUsuario(negocio.duenoUid), store.getUso(negocio.id, mes)]);
      const finTarjeta = negocio.manualSiguiente ? negocio.stripe?.finPeriodo : undefined;
      return { negocio, efectivo: estadoEfectivo(negocio, ahora, modo(deps)), dueno: dueno?.email ?? "",
        usoMes,
        saldo: { ...negocio.paquetes },
        ...(finTarjeta !== undefined ? { finTarjeta } : {}),
      };
    }),
  );
  return { ok: true, negocios: filas };
}

export async function obtenerNegocio(
  adminEmail: string,
  emailVerified: boolean,
  negocioId: string,
  deps: DepsAdmin = {},
): Promise<{ ok: true; negocio: Negocio; efectivo: Efectivo; pagos: PagoManual[]; movimientos: MovimientoPaquete[] } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) return NO_ADMIN();
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const negocio = await store.getNegocio(negocioId);
  if (!negocio) return NO_NEGOCIO();
  return {
    ok: true,
    negocio,
    efectivo: estadoEfectivo(negocio, ahora, modo(deps)),
    pagos: await store.listarPagosManuales(negocioId),
    movimientos: await store.listarMovimientos(negocioId),
  };
}

// Revisa los datos de un pago a mano (plan, fecha futura, monto y forma de pago). null = están bien.
// También la usa pasarAManual (lib/stripe-api.ts).
export function validarDatosActivar(datos: DatosActivar, ahora: number): Falla | null {
  if (datos.plan !== "basico" && datos.plan !== "pro") return falla(400, "Elige Básico o Pro.");
  if (typeof datos.hasta !== "number" || !Number.isFinite(datos.hasta) || datos.hasta <= ahora) {
    return falla(400, "La fecha de pago debe ser futura.");
  }
  if (typeof datos.monto !== "number" || !Number.isFinite(datos.monto) || datos.monto < 0) {
    return falla(400, "Escribe un monto válido.");
  }
  if (!METODOS.includes(datos.metodo)) return falla(400, "Elige la forma de pago.");
  return null;
}

export async function activarManual(
  adminEmail: string,
  emailVerified: boolean,
  negocioId: string,
  datos: DatosActivar,
  deps: DepsAdmin = {},
): Promise<{ ok: true } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) return NO_ADMIN();
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();

  const invalido = validarDatosActivar(datos, ahora);
  if (invalido) return invalido;

  const negocio = await store.getNegocio(negocioId);
  if (!negocio) return NO_NEGOCIO();
  // Si su suscripción de tarjeta todavía puede cobrar (también past_due, unpaid o paused, que Stripe
  // reintenta), activarlo a mano cobraría dos veces. Una suscripción del otro modo de Stripe no cobra aquí.
  const st = negocio.stripe;
  const otroModo = st?.livemode !== undefined && st.livemode !== modo(deps).stripeLive;
  if (SUSCRIPCION_VIVA.has(st?.status ?? "") && !otroModo) {
    return falla(400, "Este negocio ya paga con tarjeta. Cancela su suscripción en Stripe antes de activarlo a mano.");
  }

  const nota = typeof datos.nota === "string" ? datos.nota.trim().slice(0, 300) : "";
  await store.registrarPagoManual({
    id: crypto.randomUUID(),
    negocioId,
    plan: datos.plan,
    monto: datos.monto,
    metodo: datos.metodo,
    hasta: datos.hasta,
    ...(nota ? { nota } : {}),
    registradoPor: adminEmail.trim().toLowerCase(),
    fecha: ahora,
  });
  await store.actualizarNegocio(negocioId, {
    plan: datos.plan,
    estado: "activo",
    origen: "manual",
    pagadoHasta: datos.hasta,
    actualizado: ahora,
  });
  return { ok: true };
}

export async function pausar(
  adminEmail: string,
  emailVerified: boolean,
  negocioId: string,
  deps: DepsAdmin = {},
): Promise<{ ok: true } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) return NO_ADMIN();
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  if (!(await store.getNegocio(negocioId))) return NO_NEGOCIO();
  await store.actualizarNegocio(negocioId, { estado: "pausado", actualizado: ahora });
  return { ok: true };
}

export async function reactivar(
  adminEmail: string,
  emailVerified: boolean,
  negocioId: string,
  deps: DepsAdmin = {},
): Promise<{ ok: true } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) return NO_ADMIN();
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const n = await store.getNegocio(negocioId);
  if (!n) return NO_NEGOCIO();

  if (n.origen === "stripe") {
    if (!stripeAlDia(n)) return falla(400, "La suscripción de Stripe no está al día; no se puede reactivar.");
  } else if (n.origen === "manual") {
    if (n.pagadoHasta === undefined || n.pagadoHasta <= ahora) {
      return falla(400, "El pago a mano ya venció. Registra un pago nuevo con «Activar plan».");
    }
  } else {
    return falla(400, "Este negocio no tiene un plan pagado.");
  }
  await store.actualizarNegocio(negocioId, { estado: "activo", actualizado: ahora });
  return { ok: true };
}

// Borra el pago a mano pendiente (manualSiguiente) y el aviso «Revisar» (stripe.renovoConManual).
// Para cuando el cliente decide seguir con tarjeta o se registró mal la fecha o el monto.
// No toca Stripe: si la suscripción sigue con la cancelación al final del mes, la cuenta se pausa ese día.
// No se anota en el historial de pagos (no es un pago: el renglón del pago a mano original se queda);
// queda en el registro del servidor.
export async function quitarManualPendiente(
  adminEmail: string,
  emailVerified: boolean,
  negocioId: string,
  deps: DepsAdmin = {},
): Promise<{ ok: true } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) return NO_ADMIN();
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  let quitado: Negocio["manualSiguiente"];
  const r = await store.modificarNegocio(negocioId, (n) => {
    quitado = n.manualSiguiente; // se asigna en cada vuelta: Firestore puede repetir la transacción
    if (!quitado) return null;
    const { renovoConManual: _r, ...stripe } = n.stripe ?? {};
    void _r;
    return { manualSiguiente: null, ...(n.stripe ? { stripe } : {}), actualizado: ahora };
  });
  if (r === "no_existe") return NO_NEGOCIO();
  if (!quitado) return falla(400, "Este negocio no tiene un pago a mano pendiente.");
  console.info(
    `Admin ${adminEmail.trim().toLowerCase()} quitó el pago a mano pendiente del negocio ${negocioId} ` +
      `(plan ${quitado.plan}, hasta ${new Date(quitado.hasta).toISOString()}).`,
  );
  return { ok: true };
}

const CONTADORES: Contador[] = ["textos", "imagenes", "voces", "subtitulos", "tomas_ia"];
const notaLimpia = (n: unknown) => (typeof n === "string" ? n.trim().slice(0, 300) : "");

// Suma a mano el contenido de un paquete al saldo. Solo paquetes del plan guardado del negocio
// (p. ej. Voz solo a un negocio Pro), aunque el plan esté en pausa o vencido.
export async function agregarPaquete(
  adminEmail: string,
  emailVerified: boolean,
  negocioId: string,
  d: { paquete: PaqueteId; metodo: PagoManual["metodo"]; nota?: string },
  deps: DepsAdmin = {},
): Promise<{ ok: true } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) return NO_ADMIN();
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();

  if (!esPaquete(d.paquete)) return falla(400, "Elige un paquete.");
  if (!METODOS.includes(d.metodo)) return falla(400, "Método de pago no válido.");

  const { contenido, planes } = (await store.getConfig()).paquetes[d.paquete];
  let deOtroPlan = false;
  const r = await store.modificarNegocio(negocioId, (n) => {
    // Se revisa con el negocio leído aquí mismo (no con una copia vieja).
    // Se asigna en cada vuelta: Firestore puede repetir la transacción.
    deOtroPlan = !n.plan || !planes.includes(n.plan);
    if (deOtroPlan) return null;
    return { paquetes: sumarSaldo(n.paquetes, contenido, 1), actualizado: ahora };
  });
  if (r === "no_existe") return NO_NEGOCIO();
  if (deOtroPlan) {
    return falla(400, d.paquete === "voz" ? "El paquete Voz es del plan Pro." : "Este paquete no es del plan de este negocio.");
  }

  const nota = notaLimpia(d.nota);
  await store.registrarMovimiento({
    id: crypto.randomUUID(),
    negocioId,
    tipo: "agregar",
    paquete: d.paquete,
    cantidades: { ...contenido },
    metodo: d.metodo,
    ...(nota ? { nota } : {}),
    registradoPor: adminEmail.trim().toLowerCase(),
    fecha: ahora,
  });
  return { ok: true };
}

// Quita saldo a mano (por un error o un reembolso). Se quita como mucho lo que hay.
export async function quitarSaldo(
  adminEmail: string,
  emailVerified: boolean,
  negocioId: string,
  d: { cantidades: Saldo; nota?: string },
  deps: DepsAdmin = {},
): Promise<{ ok: true } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) return NO_ADMIN();
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();

  const c = d.cantidades as unknown;
  if (typeof c !== "object" || c === null || Array.isArray(c)) return falla(400, "Cantidades no válidas.");
  const pedido: Saldo = {};
  for (const [k, v] of Object.entries(c)) {
    if (!CONTADORES.includes(k as Contador) || typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      return falla(400, "Cantidades no válidas.");
    }
    pedido[k as Contador] = v;
  }
  if (!Object.values(pedido).some((v) => v > 0)) return falla(400, "Cantidades no válidas.");

  const quitado: Saldo = {};
  const r = await store.modificarNegocio(negocioId, (n) => {
    // Se recalcula dentro de la transacción: si la hace reintentar, no se acumula
    for (const k of Object.keys(quitado) as Contador[]) delete quitado[k];
    for (const [k, v] of Object.entries(pedido) as [Contador, number][]) {
      const real = Math.min(v, n.paquetes?.[k] ?? 0);
      if (real > 0) quitado[k] = real;
    }
    if (Object.keys(quitado).length === 0) return null;
    return { paquetes: sumarSaldo(n.paquetes, quitado, -1), actualizado: ahora };
  });
  if (r === "no_existe") return NO_NEGOCIO();

  if (Object.keys(quitado).length > 0) {
    const nota = notaLimpia(d.nota);
    await store.registrarMovimiento({
      id: crypto.randomUUID(),
      negocioId,
      tipo: "quitar",
      cantidades: quitado,
      ...(nota ? { nota } : {}),
      registradoPor: adminEmail.trim().toLowerCase(),
      fecha: ahora,
    });
  }
  return { ok: true };
}
