// Reduce una imagen del dispositivo dentro del navegador antes de enviarla.
// Así las fotos del celular (que pesan varios MB) viajan ligeras y caben
// en los límites del servidor (Netlify/Vercel) y de los proveedores.

// Reduce una imagen que ya está como data URL (por ejemplo, una foto de la cámara) al lado máximo indicado.
export async function dataUrlReducida(src: string, maxSide: number, quality = 0.88): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("No se pudo leer la imagen."));
    el.src = src;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (scale === 1) return src;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no permite procesar la imagen.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function fileToResizedDataUrl(
  file: File,
  maxSide: number,
  quality = 0.88,
  keepTransparency = false
): Promise<string> {
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
  if (keepTransparency) {
    // Para logos: conservamos el fondo transparente.
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  }
  ctx.fillStyle = "#ffffff"; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
