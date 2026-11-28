// «NOVA ve tus fotos», del lado de la pantalla: achica las fotos y le pide a /api/ver qué se ve.
// Nunca lanza: si algo falla devuelve las descripciones en null y el motivo, para seguir a mano.

import { dataUrlReducida } from "./resize";
import { LADO_VER } from "./ver-fotos";

export type Visto = { descripciones: (string | null)[]; error?: string; codigo?: string };

const TIEMPO_MAXIMO = 50_000;

export async function pedirDescripciones(fotos: string[], headers: Record<string, string>, senal?: AbortSignal): Promise<Visto> {
  const nada: (string | null)[] = fotos.map(() => null);
  const corte = AbortSignal.timeout(TIEMPO_MAXIMO);
  const signal = senal ? AbortSignal.any([senal, corte]) : corte;
  try {
    const chicas = await Promise.all(fotos.map((f) => dataUrlReducida(f, LADO_VER, 0.8)));
    const res = await fetch("/api/ver", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ fotos: chicas }), signal });
    const datos = await res.json().catch(() => ({}));
    const d = Array.isArray(datos?.descripciones) ? (datos.descripciones as unknown[]) : [];
    return {
      descripciones: nada.map((_, i) => (typeof d[i] === "string" && d[i] ? (d[i] as string) : null)),
      ...(typeof datos?.error === "string" ? { error: datos.error } : !res.ok ? { error: "No pude ver las fotos en este momento." } : {}),
      ...(typeof datos?.codigo === "string" ? { codigo: datos.codigo } : {}),
    };
  } catch (e) {
    if (senal?.aborted) return { descripciones: nada, codigo: "CANCELADO" };
    return { descripciones: nada, error: (e as Error)?.name === "TimeoutError" ? "Ver las fotos tardó demasiado." : "No pude ver las fotos en este momento." };
  }
}
