// Exportación rápida del reel: en vez de grabar el video mientras se reproduce (un video de 2 minutos
// tarda 2 minutos), se dibuja y codifica cuadro por cuadro tan rápido como dé el dispositivo.
// Solo sirve para videos hechos de fotos: un clip de video hay que reproducirlo para capturarlo.
// Aquí van las cuentas (puras, con pruebas); la codificación vive en lib/reel.ts.

export const FPS_RAPIDO = 30;
export const MUESTRAS_AUDIO = 44100; // por segundo
export const BLOQUE_AUDIO = 4096; // muestras por bloque que se le pasa al codificador

// ¿Se puede exportar rápido? Solo si ninguna escena lleva video (toma con IA o video propio).
export function sirveParaRapido(escenas: { segundos: number; video?: unknown }[]): boolean {
  return escenas.length > 0 && escenas.every((e) => !e.video);
}

export const cuadrosDe = (segundos: number) => Math.max(1, Math.ceil(segundos * FPS_RAPIDO - 1e-6));
export const momentoDe = (cuadro: number) => cuadro / FPS_RAPIDO;

// H.264 «baseline»: lo abren todos los celulares, Instagram, TikTok y WhatsApp.
// El nivel 3.1 alcanza hasta 1280×720; el cuadrado de 1080×1080 necesita el 4.0.
export function codecDeVideo(ancho: number, alto: number): string {
  return ancho * alto > 1280 * 720 ? "avc1.42E028" : "avc1.42E01F";
}

export function trozosDeAudio(muestras: number, bloque: number = BLOQUE_AUDIO): { desde: number; cuantas: number }[] {
  const t: { desde: number; cuantas: number }[] = [];
  for (let d = 0; d < muestras; d += bloque) t.push({ desde: d, cuantas: Math.min(bloque, muestras - d) });
  return t;
}
