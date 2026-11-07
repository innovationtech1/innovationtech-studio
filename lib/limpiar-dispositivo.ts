// Limpieza del dispositivo para cuando varias personas usan el mismo aparato (cuentas encendidas).
// Las claves propias (Cloudflare, Anthropic, Replicate) se guardan en el navegador: al cerrar
// sesión, o si entra otra persona, se borran. La galería y «Mi marca» solo si la persona lo pide.

import { clearItems } from "./media-store";

export const ULTIMO_UID = "studio:ultimoUid";
const AJUSTES = "its-settings";
const CLAVES = ["anthropicKey", "replicateKey", "cfAccountId", "cfToken"] as const;
const MARCA = ["its-brand", "its-logo", "its-accent"];

// Quita solo los campos de claves de los ajustes guardados (lo demás, como el modelo elegido, se queda).
export function quitarClaves(raw: string | null): string | null {
  if (!raw) return raw;
  try {
    const ajustes = JSON.parse(raw);
    if (!ajustes || typeof ajustes !== "object") return raw;
    for (const k of CLAVES) if (k in ajustes) ajustes[k] = "";
    return JSON.stringify(ajustes);
  } catch {
    return raw;
  }
}

export function borrarClavesPropias() {
  try {
    const raw = localStorage.getItem(AJUSTES);
    const limpio = quitarClaves(raw);
    if (limpio !== null && limpio !== raw) localStorage.setItem(AJUSTES, limpio);
  } catch {
    /* sin almacenamiento */
  }
}

export async function borrarGaleriaYMarca() {
  try {
    for (const k of MARCA) localStorage.removeItem(k);
  } catch {
    /* sin almacenamiento */
  }
  await clearItems().catch(() => {});
}

// Borra las claves y pregunta si también se borran la galería y «Mi marca».
export async function limpiarDispositivo(pregunta: string) {
  borrarClavesPropias();
  if (window.confirm(pregunta)) await borrarGaleriaYMarca();
}

export function leerUltimoUid(): string {
  try {
    return localStorage.getItem(ULTIMO_UID) ?? "";
  } catch {
    return "";
  }
}

export function guardarUltimoUid(uid: string) {
  try {
    localStorage.setItem(ULTIMO_UID, uid);
  } catch {
    /* sin almacenamiento */
  }
}
