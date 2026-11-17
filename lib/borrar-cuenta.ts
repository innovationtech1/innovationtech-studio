import "server-only";
import type { AccountStore } from "./account-store";
import { firestoreStore } from "./account-store";
import { esCorreoAdmin, type Falla } from "./account-api";
import type { Negocio } from "./plans";
import type { VideoStore } from "./video-store";
import { huellaCorreo } from "./huella";

export { huellaCorreo } from "./huella";

// Borrar la cuenta (botón en «Mi cuenta»). No se puede deshacer.
//  - Miembro del equipo: sale del negocio y se borra su usuario; el negocio no se toca.
//  - Dueño: se cancela Stripe de inmediato y se borra el negocio con todo lo suyo (equipo, uso,
//    invitaciones, clave de Cloudflare, trabajos de video y archivos). Se CONSERVAN los pagos
//    (por ley) y queda una anotación sin nombre ni correo para el administrador.
// Orden pensado para que un fallo a medias nunca deje a alguien sin cuenta pero con cobros:
// primero Stripe (si falla, no se borra nada) y al final el inicio de sesión.

export const PALABRA_BORRAR = "BORRAR";

export type SesionBorrar = { uid: string; email: string; emailVerified: boolean };

export type DepsBorrar = {
  store?: AccountStore;
  videos?: VideoStore;
  now?: number;
  secreto?: string; // para la huella del correo
  cancelarStripe?: (n: Negocio) => Promise<{ ok: true } | Falla>;
  // Borra las carpetas dadas del almacén de archivos. Devuelve las que NO pudo borrar.
  borrarArchivos?: (prefijos: string[]) => Promise<string[]>;
  borrarAcceso?: (uid: string) => Promise<void>; // el inicio de sesión (Firebase)
};

const falla = (status: number, error: string, codigo?: string): Falla =>
  codigo ? { ok: false, status, error, codigo } : { ok: false, status, error };

export async function borrarCuenta(
  sesion: SesionBorrar,
  cuerpo: unknown,
  deps: DepsBorrar = {},
): Promise<{ ok: true; tipo: "dueno" | "miembro" | "sin_cuenta" } | Falla> {
  const confirmacion = (cuerpo as { confirmacion?: unknown } | null)?.confirmacion;
  if (confirmacion !== PALABRA_BORRAR) return falla(400, `Para borrar tu cuenta escribe ${PALABRA_BORRAR}.`, "CONFIRMAR");
  if (esCorreoAdmin(sesion.email, sesion.emailVerified)) {
    return falla(403, "La cuenta de administrador no se puede borrar desde aquí.", "ES_ADMIN");
  }
  const store = deps.store ?? firestoreStore();
  const ahora = deps.now ?? Date.now();
  const d = await reales(deps);

  const usuario = await store.getUsuario(sesion.uid);
  const negocio = usuario ? await store.getNegocio(usuario.negocioId) : null;

  // Sin cuenta creada (o un borrado que quedó a medias): solo falta quitar el inicio de sesión
  if (!usuario || !negocio) {
    if (usuario) await store.borrarUsuario(usuario.uid, usuario.negocioId);
    await d.borrarAcceso(sesion.uid).catch(() => {});
    return { ok: true, tipo: "sin_cuenta" };
  }

  // Miembro del equipo: sale del negocio; el negocio y el plan del dueño no se tocan
  if (negocio.duenoUid !== sesion.uid) {
    await store.quitarMiembro(negocio.id, sesion.uid);
    await d.borrarAcceso(sesion.uid).catch((e) => console.error(`Borrar cuenta: no se pudo quitar el inicio de sesión de un miembro (${motivo(e)}).`));
    return { ok: true, tipo: "miembro" };
  }

  // 1) Stripe primero: si no se puede cancelar, no se borra nada
  const stripe = await d.cancelarStripe(negocio);
  if (!stripe.ok) {
    return falla(stripe.status >= 500 ? 502 : stripe.status, "No pudimos cancelar tu suscripción, así que no borramos nada. Intenta de nuevo en un momento.", "STRIPE");
  }

  // 2) La huella del correo: quien vuelva con el mismo correo ya no recibe otra prueba gratis
  await store.guardarHuella(huellaCorreo(usuario.email, deps.secreto), ahora);

  // 3) Video con IA: trabajos y archivos (fotos y clips). Lo que no se pueda borrar queda anotado.
  const pendientes: string[] = [];
  await d.videos.borrarTrabajosDeNegocio(negocio.id);
  // Solo las carpetas de ESTA versión: una versión de prueba nunca borra archivos de producción
  const carpetas = (await import("./r2")).carpetasNegocio(negocio.id);
  const sinBorrar = await d.borrarArchivos(carpetas).catch(() => carpetas);
  for (const c of sinBorrar) pendientes.push(`archivos: ${c}`);

  // 4) El equipo pierde el acceso (se borra su usuario, no su inicio de sesión: ellos no lo pidieron)
  const personas = new Set([...negocio.miembros, negocio.duenoUid]);
  for (const uid of personas) if (uid !== sesion.uid) await store.borrarUsuario(uid, negocio.id);

  // 5) El negocio con sus contadores, invitaciones y clave. Los pagos se conservan.
  await store.borrarNegocio(negocio.id);
  await store.borrarUsuario(sesion.uid, negocio.id);

  // 6) El inicio de sesión del dueño
  try {
    await d.borrarAcceso(sesion.uid);
  } catch (e) {
    console.error(`Borrar cuenta: no se pudo quitar el inicio de sesión (${motivo(e)}).`);
    pendientes.push("inicio de sesión");
  }

  // 7) Anotación para el administrador: sin nombre ni correo
  await store.anotarBorrado({
    negocioId: negocio.id,
    fecha: ahora,
    customerId: negocio.stripe?.customerId,
    personas: personas.size,
    pendientes,
  });
  return { ok: true, tipo: "dueno" };
}

const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Las piezas reales (Stripe, almacén de archivos, Firebase) cuando las pruebas no pasan las suyas.
async function reales(deps: DepsBorrar) {
  return {
    videos: deps.videos ?? (await import("./video-store")).firestoreVideoStore(),
    cancelarStripe:
      deps.cancelarStripe ??
      (async (n: Negocio) => {
        const r = await (await import("./stripe-api")).cancelarSuscripciones(n, { store: deps.store });
        return r.ok ? ({ ok: true } as const) : r;
      }),
    borrarArchivos:
      deps.borrarArchivos ??
      (async (prefijos: string[]) => {
        const { borrarCarpeta, configR2 } = await import("./r2");
        if (!configR2()) return []; // sin almacén configurado no hay archivos que borrar
        const fallos: string[] = [];
        for (const p of prefijos) {
          try {
            await borrarCarpeta(p);
          } catch (e) {
            console.error(`Borrar cuenta: no se pudo borrar la carpeta ${p} (${motivo(e)}).`);
            fallos.push(p);
          }
        }
        return fallos;
      }),
    borrarAcceso: deps.borrarAcceso ?? (async (uid: string) => (await import("./firebase-acceso")).borrarAcceso(uid)),
  };
}
