// Textos: publicar el texto junto con una imagen o un video. Solo reglas, sin pantalla: qué archivo se
// acepta, qué texto se comparte y cómo se comparte cuando no hay archivo (app/texto-adjunto.tsx).

export const MAX_IMAGEN_MB = 25;
export const MAX_VIDEO_ADJUNTO_MB = 100; // el mismo tope que un video propio en el editor (lib/video-propio.ts)
const MB = 1024 * 1024;

export type TipoAdjunto = "imagen" | "video";

// La publicación lista para pegar: sin las ideas internas («PROMPT DE IMAGEN: …», «PROMPT DE VIDEO: …»)
export function textoParaPublicar(resultado: string): string {
  return resultado
    .replace(/^[ \t*_>-]*PROMPT DE (?:IMAGEN|VIDEO):?.*(?:\r?\n|$)/gim, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const EXT_IMAGEN = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i;
const EXT_VIDEO = /\.(mp4|mov|m4v|webm|3gp|mkv)$/i;

// ¿Se puede adjuntar? Algunos teléfonos no dicen el tipo del archivo: entonces se mira la terminación.
export function validarAdjunto(a: { type: string; size: number; name: string }): { ok: true; tipo: TipoAdjunto } | { ok: false; error: string } {
  const tipo: TipoAdjunto | null = a.type.startsWith("image/")
    ? "imagen"
    : a.type.startsWith("video/")
    ? "video"
    : a.type
    ? null
    : EXT_IMAGEN.test(a.name)
    ? "imagen"
    : EXT_VIDEO.test(a.name)
    ? "video"
    : null;
  if (!tipo) return { ok: false, error: "Ese archivo no es una imagen ni un video." };
  if (a.size <= 0) return { ok: false, error: "Ese archivo está vacío." };
  if (tipo === "imagen" && a.size > MAX_IMAGEN_MB * MB) return { ok: false, error: `Esa imagen pesa más de ${MAX_IMAGEN_MB} MB.` };
  if (tipo === "video" && a.size > MAX_VIDEO_ADJUNTO_MB * MB) return { ok: false, error: `Ese video pesa más de ${MAX_VIDEO_ADJUNTO_MB} MB.` };
  return { ok: true, tipo };
}

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function nombreAdjunto(tipo: TipoAdjunto, mime: string): string {
  return `publicacion-innovationtech.${EXTENSION[mime] ?? (tipo === "video" ? "mp4" : "jpg")}`;
}

export type ResultadoTexto = "compartido" | "cancelado" | "copiado" | "vacio" | "fallo";
type Navegador = { share?: (d: ShareData) => Promise<void>; clipboard?: { writeText: (t: string) => Promise<void> } };

// Compartir solo el texto: el menú del aparato si lo hay; si no (o si falla), se copia para pegarlo.
export async function compartirTexto(
  texto: string,
  nav: Navegador | undefined = typeof navigator !== "undefined" ? (navigator as Navegador) : undefined,
): Promise<ResultadoTexto> {
  if (!texto.trim()) return "vacio";
  if (typeof nav?.share === "function") {
    try {
      await nav.share({ text: texto });
      return "compartido";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelado";
    }
  }
  try {
    if (!nav?.clipboard) return "fallo";
    await nav.clipboard.writeText(texto);
    return "copiado";
  } catch {
    return "fallo";
  }
}
