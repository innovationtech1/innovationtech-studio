// «Editar con IA», del lado de la pantalla: achica la foto y le pide a /api/editar el resultado.
// Nunca lanza: si algo falla devuelve el motivo para que la persona vuelva a intentar.

import { LADO_EDITAR } from "./editar-ia";
import { tr } from "./i18n";

export type Editada = { url?: string; formato?: string; error?: string; codigo?: string };

const TIEMPO_MAXIMO = 58_000;

async function abrir(src: string): Promise<HTMLImageElement> {
  let url = src;
  if (!src.startsWith("data:") && !src.startsWith("blob:")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error("abrir");
    url = URL.createObjectURL(await res.blob());
  }
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("abrir"));
    im.src = url;
  });
}

// La foto como JPG de menos de 512 px por lado (sobre blanco, por si trae transparencia).
export async function fotoParaEditar(src: string): Promise<{ foto: string; ancho: number; alto: number }> {
  const im = await abrir(src);
  const k = Math.min(1, LADO_EDITAR / Math.max(im.naturalWidth, im.naturalHeight));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.max(1, Math.round(im.naturalWidth * k));
  lienzo.height = Math.max(1, Math.round(im.naturalHeight * k));
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("lienzo");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(im, 0, 0, lienzo.width, lienzo.height);
  return { foto: lienzo.toDataURL("image/jpeg", 0.92), ancho: im.naturalWidth, alto: im.naturalHeight };
}

export async function pedirEdicion(src: string, pedido: string, headers: Record<string, string>, senal?: AbortSignal): Promise<Editada> {
  const corte = AbortSignal.timeout(TIEMPO_MAXIMO);
  const signal = senal ? AbortSignal.any([senal, corte]) : corte;
  try {
    const f = await fotoParaEditar(src).catch(() => null);
    if (!f) return { error: tr("No pude abrir esta foto.") };
    const res = await fetch("/api/editar", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ ...f, pedido }), signal });
    const datos = await res.json().catch(() => ({}));
    if (res.ok && typeof datos?.url === "string" && datos.url) return { url: datos.url, ...(typeof datos.formato === "string" ? { formato: datos.formato } : {}) };
    return {
      error: typeof datos?.error === "string" && datos.error ? datos.error : tr("No pude editar la foto en este momento."),
      ...(typeof datos?.codigo === "string" ? { codigo: datos.codigo } : {}),
    };
  } catch (e) {
    if (senal?.aborted) return { codigo: "CANCELADO" };
    return { error: (e as Error)?.name === "TimeoutError" ? tr("Editar la foto tardó demasiado.") : tr("No pude editar la foto en este momento.") };
  }
}
