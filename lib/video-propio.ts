// Videos propios del Creador de Reels: se quedan en el dispositivo, nunca se suben a un servidor.
// Un video subido se guarda en «archivos» con un id «reelvid-…»; uno de la galería (o grabado con la
// cámara de Studio, que también va a la galería) se usa desde ahí con el id «gal:…», sin copiarlo.

import { deleteFile, getFile, getItem, listFileIds, newId, putFile } from "./media-store";

export const MAX_VIDEO_MB = 100;
const PREFIJO = "reelvid-";
const GALERIA = "gal:";

// null = el archivo se puede usar. Si no, el mensaje para la persona.
export function revisarArchivo(a: { size: number; type: string }): string | null {
  if (a.type && !a.type.startsWith("video/")) return "Elige un archivo de video.";
  if (a.size <= 0) return "Este video no se puede abrir en tu navegador.";
  if (a.size > MAX_VIDEO_MB * 1024 * 1024) return `Ese video pesa más de ${MAX_VIDEO_MB} MB.`;
  return null;
}

export function idDeArchivo(origen: "dispositivo" | "galeria", id: string): string {
  return origen === "galeria" ? `${GALERIA}${id}` : `${PREFIJO}${id}`;
}

export function origenDe(archivoId: string): { origen: "dispositivo" | "galeria"; id: string } | null {
  if (archivoId.startsWith(GALERIA)) return { origen: "galeria", id: archivoId.slice(GALERIA.length) };
  if (archivoId.startsWith(PREFIJO)) return { origen: "dispositivo", id: archivoId };
  return null;
}

// De los archivos guardados, los videos del reel que ya ningún clip usa (se pueden borrar)
export function huerfanos(guardados: string[], enUso: string[]): string[] {
  const usados = new Set(enUso);
  return guardados.filter((id) => id.startsWith(PREFIJO) && !usados.has(id));
}

// ---------- En el navegador ----------

// Lee cuánto dura un video y saca su cuadro de portada (JPG de hasta 720 px de lado).
export async function leerVideo(archivo: Blob): Promise<{ duracion: number; portada: string }> {
  const url = URL.createObjectURL(archivo);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error("Este video no se puede abrir en tu navegador."));
    });
    let duracion = v.duration;
    if (!Number.isFinite(duracion)) {
      // Los videos grabados en el navegador a veces no traen duración: se mide buscando el final
      v.currentTime = 1e7;
      await new Promise<void>((r) => {
        v.ondurationchange = () => r();
        setTimeout(r, 3000);
      });
      duracion = v.duration;
    }
    if (!Number.isFinite(duracion) || duracion <= 0) throw new Error("Este video no se puede abrir en tu navegador.");
    await new Promise<void>((res) => {
      v.addEventListener("seeked", () => res(), { once: true });
      setTimeout(res, 1500);
      v.currentTime = Math.min(0.2, duracion / 2);
    });
    return { duracion: Math.round(duracion * 100) / 100, portada: cuadroDe(v) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// El cuadro que el video muestra en este momento, como JPG
export function cuadroDe(v: HTMLVideoElement, ladoMaximo = 720): string {
  const w = v.videoWidth || 1;
  const h = v.videoHeight || 1;
  const k = Math.min(1, ladoMaximo / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

// Guarda en el dispositivo un video subido y devuelve lo que necesita su clip
export async function guardarVideo(archivo: Blob): Promise<{ archivoId: string; duracion: number; portada: string }> {
  const problema = revisarArchivo(archivo);
  if (problema) throw new Error(problema);
  const datos = await leerVideo(archivo);
  const archivoId = idDeArchivo("dispositivo", newId());
  await putFile(archivoId, archivo);
  return { archivoId, ...datos };
}

// Abre el archivo de un clip de video. null = ya no está en este dispositivo.
export async function abrirVideo(archivoId: string): Promise<Blob | null> {
  const o = origenDe(archivoId);
  if (!o) return null;
  try {
    if (o.origen === "galeria") return (await getItem(o.id))?.blob ?? null;
    return await getFile(o.id);
  } catch {
    return null;
  }
}

// Borra del dispositivo los videos del reel que ningún clip usa
export async function limpiarHuerfanos(enUso: string[]): Promise<void> {
  try {
    for (const id of huerfanos(await listFileIds(), enUso)) await deleteFile(id);
  } catch {
    /* sin almacenamiento: no hay nada que limpiar */
  }
}
