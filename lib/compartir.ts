// Compartir un resultado con el menú del teléfono o de la computadora (Web Share con archivos).
// Si el navegador no deja compartir el archivo, se descarga. Sin acceso al DOM al importar.

export type ResultadoCompartir = "compartido" | "cancelado" | "descargar";

type Navegador = {
  share: (d: ShareData) => Promise<void>;
  canShare?: (d: ShareData) => boolean;
  clipboard?: { writeText: (t: string) => Promise<void> };
};

export async function compartirArchivos(
  archivos: File[],
  texto?: string,
  nav: Navegador | undefined = typeof navigator !== "undefined" ? (navigator as Navegador) : undefined,
): Promise<ResultadoCompartir> {
  if (!nav || typeof nav.share !== "function") return "descargar";
  let puede = false;
  try {
    puede = !!nav.canShare?.({ files: archivos });
  } catch {
    puede = false;
  }
  if (!puede) return "descargar";
  if (texto) {
    try {
      await nav.clipboard?.writeText(texto);
    } catch {
      // Si no se pudo copiar, se comparte igual.
    }
  }
  try {
    await nav.share(texto ? { files: archivos, text: texto } : { files: archivos });
    return "compartido";
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return "cancelado";
    return "descargar";
  }
}

export async function aArchivo(src: Blob | string, nombre: string, f?: typeof fetch): Promise<File | null> {
  if (typeof src !== "string") return new File([src], nombre, { type: src.type });
  try {
    const r = await (f ?? fetch)(src);
    if (!r.ok) return null;
    const blob = await r.blob();
    return new File([blob], nombre, { type: blob.type });
  } catch {
    return null;
  }
}

export function descargarArchivo(archivo: File): void {
  const url = URL.createObjectURL(archivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
