// Lado del navegador de las tomas con IA: prepara la foto, la sube a R2 con el enlace temporal,
// pide las tomas y consulta su estado. La sesión la agrega sola la app a las rutas /api.
import { toBlob } from "./media-store";
import type { TrabajoVisto } from "./estados-video";

const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOTO = 8 * 1024 * 1024;

export type FotoLista = { blob: Blob; sha256: string };

// Pasa la foto a JPG si viene en otro formato o pesa más de 8 MB.
async function aJpeg(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo preparar la foto."))), "image/jpeg", 0.9));
}

export async function prepararFoto(src: string): Promise<FotoLista> {
  let blob = await toBlob(src);
  if (!blob) throw new Error("No se pudo abrir una de las fotos. Súbela de nuevo.");
  if (!TIPOS.includes(blob.type) || blob.size > MAX_FOTO) blob = await aJpeg(blob);
  if (blob.size > MAX_FOTO) throw new Error("La foto pesa demasiado. El máximo es 8 MB.");
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const sha256 = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { blob, sha256 };
}

async function leer(res: Response): Promise<Record<string, unknown>> {
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "No se pudo completar. Intenta de nuevo.");
  return d;
}

// Sube la foto directo a R2 y devuelve su llave. onPct recibe el avance (0 a 100).
export async function subirFoto(f: FotoLista, onPct: (pct: number) => void): Promise<string> {
  const d = await leer(
    await fetch("/api/video-ia/subida", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo: f.blob.type, bytes: f.blob.size, sha256: f.sha256 }),
    }),
  );
  await new Promise<void>((res, rej) => {
    const x = new XMLHttpRequest();
    x.open("PUT", String(d.url));
    x.setRequestHeader("Content-Type", f.blob.type);
    x.upload.onprogress = (e) => e.lengthComputable && onPct((e.loaded / e.total) * 100);
    x.onload = () => (x.status >= 200 && x.status < 300 ? res() : rej(new Error("No se pudo subir la foto. Intenta de nuevo.")));
    x.onerror = () => rej(new Error("No se pudo subir la foto. Revisa tu conexión."));
    x.send(f.blob);
  });
  return String(d.imagenKey);
}

export async function pedirTomas(tomas: { imagenKey: string; movimiento: string }[]): Promise<string[]> {
  const d = await leer(
    await fetch("/api/video-ia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tomas }) }),
  );
  return (d.trabajos as { id: string }[]).map((t) => t.id);
}

export async function consultarTomas(ids: string[]): Promise<{ trabajos: TrabajoVisto[]; topeHoy: boolean }> {
  const d = await leer(await fetch(`/api/video-ia?ids=${ids.map(encodeURIComponent).join(",")}`));
  return { trabajos: d.trabajos as TrabajoVisto[], topeHoy: d.topeHoy === true };
}
