// Historial para deshacer y rehacer. Vive solo en memoria: al recargar la app se empieza de nuevo.
// Ninguna función modifica el historial que recibe.

export type Historial<T> = { pasado: T[]; presente: T; futuro: T[] };
export const MAX_PASOS = 50;

export function crear<T>(presente: T): Historial<T> {
  return { pasado: [], presente, futuro: [] };
}

// Un cambio nuevo: lo anterior queda para deshacer y ya no hay nada que rehacer.
export function anotar<T>(h: Historial<T>, nuevo: T): Historial<T> {
  if (nuevo === h.presente) return h;
  return { pasado: [...h.pasado, h.presente].slice(-MAX_PASOS), presente: nuevo, futuro: [] };
}

export function deshacer<T>(h: Historial<T>): Historial<T> {
  if (h.pasado.length === 0) return h;
  return { pasado: h.pasado.slice(0, -1), presente: h.pasado[h.pasado.length - 1], futuro: [h.presente, ...h.futuro] };
}

export function rehacer<T>(h: Historial<T>): Historial<T> {
  if (h.futuro.length === 0) return h;
  return { pasado: [...h.pasado, h.presente].slice(-MAX_PASOS), presente: h.futuro[0], futuro: h.futuro.slice(1) };
}
