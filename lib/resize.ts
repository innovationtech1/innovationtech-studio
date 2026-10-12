// Reduce una imagen del dispositivo dentro del navegador antes de enviarla.
// Así las fotos del celular (que pesan varios MB) viajan ligeras y caben
// en los límites de Vercel y de los proveedores.

export async function fileToResizedDataUrl(file: File, maxSide: number, quality = 0.88): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen.");

  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Este formato de imagen no es compatible. Prueba con JPG o PNG."));
    el.src = src;
  });

  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no permite procesar la imagen.");
  ctx.fillStyle = "#ffffff"; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
