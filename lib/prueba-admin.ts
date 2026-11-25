import "server-only";
import { firestoreStore, type AccountStore } from "./account-store";
import { esCorreoAdmin, type Falla } from "./account-api";
import { DIAS_PRUEBA, esDiasPrueba, minutosDePrueba, type DiasPrueba } from "./prueba-gratis";

export * from "./prueba-gratis";

const falla = (status: number, error: string, codigo?: string): Falla =>
  codigo ? { ok: false, status, error, codigo } : { ok: false, status, error };

// El administrador elige cuánto dura la prueba gratis de las cuentas que se creen desde ahora.
// Las cuentas que ya existen conservan la fecha de fin que se les dio al crearse.
export async function ajustarPrueba(
  adminEmail: string,
  emailVerified: boolean,
  cuerpo: unknown,
  deps: { store?: AccountStore } = {},
): Promise<{ ok: true; dias: DiasPrueba } | Falla> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) return falla(403, "No tienes permiso para el panel de administrador.", "NO_ADMIN");
  const dias = (cuerpo as { dias?: unknown } | null)?.dias;
  if (!esDiasPrueba(dias)) return falla(400, `Elige una duración de prueba: ${DIAS_PRUEBA.join(", ")} días.`);
  const store = deps.store ?? firestoreStore();
  await store.guardarConfig({ pruebaMinutos: minutosDePrueba(dias) });
  return { ok: true, dias };
}
