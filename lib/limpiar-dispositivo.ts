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

// La clave de Cloudflare que quedó guardada en el navegador (si hay una completa).
export function claveCfDe(raw: string | null): { accountId: string; token: string } | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    if (!a || typeof a !== "object" || typeof a.cfAccountId !== "string" || typeof a.cfToken !== "string") return null;
    const accountId = a.cfAccountId.trim();
    const token = a.cfToken.trim();
    return accountId && token ? { accountId, token } : null;
  } catch {
    return null;
  }
}

// Quita solo la clave de Cloudflare (al guardarla en la cuenta); las otras claves se quedan.
export function quitarClaveCf(raw: string | null): string | null {
  if (!raw) return raw;
  try {
    const ajustes = JSON.parse(raw);
    if (!ajustes || typeof ajustes !== "object") return raw;
    ajustes.cfAccountId = "";
    ajustes.cfToken = "";
    return JSON.stringify(ajustes);
  } catch {
    return raw;
  }
}

// Aviso para que la app vuelva a leer sus ajustes después de cambiarlos aquí
export const EVENTO_AJUSTES = "studio:ajustes";

export function leerClaveCfLocal(): { accountId: string; token: string } | null {
  try {
    return claveCfDe(localStorage.getItem(AJUSTES));
  } catch {
    return null;
  }
}

export function borrarClaveCfLocal() {
  try {
    const raw = localStorage.getItem(AJUSTES);
    const limpio = quitarClaveCf(raw);
    if (limpio !== null && limpio !== raw) localStorage.setItem(AJUSTES, limpio);
    window.dispatchEvent(new Event(EVENTO_AJUSTES));
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

// Al cerrar sesión: por defecto NO se borra nada (el dispositivo es de quien lo usa).
// Solo si la persona marca que el dispositivo es compartido se borran sus claves propias,
// la galería y «Mi marca» de ese navegador.
export async function limpiarAlSalir(compartido: boolean) {
  if (!compartido) return;
  borrarClavesPropias();
  await borrarGaleriaYMarca();
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
