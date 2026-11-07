import "server-only";
import { firestoreStore, type AccountStore, type PagoManual } from "./account-store";
import { esCorreoAdmin, type Falla } from "./account-api";
import { diaChicago, estadoEfectivo, type Contador, type Efectivo, type Negocio } from "./plans";

// Lo que hacen las rutas /api/admin. Son funciones sin Request/Response para poder probarlas.
// Cada una revisa por su cuenta que el correo sea de administrador (además de la ruta).

export type DepsAdmin = { store?: AccountStore; now?: number };

const falla = (status: number, error: string, codigo?: string): Falla =>
  codigo ? { ok: false, status, error, codigo } : { ok: false, status, error };

const NO_ADMIN = () => falla(403, "No tienes permiso para el panel de administrador.", "NO_ADMIN");
const NO_NEGOCIO = () => falla(404, "No encontramos ese negocio.");

export type FilaNegocio = {
  negocio: Negocio;
  efectivo: Efectivo;
  dueno: string; // correo del dueño ("" si no se encuentra)
  usoHoy: Record<Contador, number>;
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
  const base = Date.UTC(y, mes - 1, d, 23, 59, 59);
  if (new Date(base).getUTCMonth() !== mes - 1) return Number.NaN; // p. ej. 31 de febrero
  // Chicago va 5 h (verano) o 6 h (invierno) detrás de UTC: se prueba cuál da 23:59:59 ese día
  const reloj = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const esperado = `${m[1]}-${m[2]}-${m[3]}, 23:59:59`;
  for (const horas of [5, 6]) {
    const t = base + horas * 3600_000;
    if (reloj.format(t) === esperado) return t;
  }
  return Number.NaN;
}

export async function listar(
  adminEmail: string,
  emailVerified: boolean,
  deps: DepsAdmin = {},
): Promise<{ ok: true; negocios: FilaNegocio[] } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) return NO_ADMIN();
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const dia = diaChicago(ahora);
  const negocios = await store.listarNegocios();
  const filas = await Promise.all(
    negocios.map(async (negocio): Promise<FilaNegocio> => {
      const [dueno, usoHoy] = await Promise.all([store.getUsuario(negocio.duenoUid), store.getUso(negocio.id, dia)]);
      return { negocio, efectivo: estadoEfectivo(negocio, ahora), dueno: dueno?.email ?? "", usoHoy };
    }),
  );
  return { ok: true, negocios: filas };
}

export async function obtenerNegocio(
  adminEmail: string,
  emailVerified: boolean,
  negocioId: string,
  deps: DepsAdmin = {},
): Promise<{ ok: true; negocio: Negocio; efectivo: Efectivo; pagos: PagoManual[] } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) return NO_ADMIN();
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const negocio = await store.getNegocio(negocioId);
  if (!negocio) return NO_NEGOCIO();
  return {
    ok: true,
    negocio,
    efectivo: estadoEfectivo(negocio, ahora),
    pagos: await store.listarPagosManuales(negocioId),
  };
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

  if (datos.plan !== "basico" && datos.plan !== "pro") return falla(400, "Elige Básico o Pro.");
  if (typeof datos.hasta !== "number" || !Number.isFinite(datos.hasta) || datos.hasta <= ahora) {
    return falla(400, "La fecha de pago debe ser futura.");
  }
  if (typeof datos.monto !== "number" || !Number.isFinite(datos.monto) || datos.monto < 0) {
    return falla(400, "Escribe un monto válido.");
  }
  if (!METODOS.includes(datos.metodo)) return falla(400, "Elige la forma de pago.");

  const negocio = await store.getNegocio(negocioId);
  if (!negocio) return NO_NEGOCIO();
  // Si ya paga con tarjeta, activarlo a mano cobraría dos veces
  if (negocio.origen === "stripe" && stripeAlDia(negocio)) {
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
