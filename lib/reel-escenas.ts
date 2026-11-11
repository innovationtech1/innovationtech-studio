// Reparto del tiempo de un video de duración fija entre sus fotos. Lógica pura (sin navegador)
// para poder probarla. Una «toma» es una foto con clip de IA: siempre dura 5 s.

export const DURACIONES = [10, 15, 20, 30] as const;
export type Duracion = (typeof DURACIONES)[number];
export const SEGUNDOS_TOMA = 5;
export const MIN_FOTO = 1.5;
export const MAX_TOMAS = 2;

export type Escena = { tipo: "foto" | "toma"; indice: number; segundos: number };

// Cuántas fotos caben como máximo (contando las tomas) en esa duración.
export function maxFotos(duracion: number, tomas: number): number {
  return tomas + Math.max(0, Math.floor((duracion - tomas * SEGUNDOS_TOMA) / MIN_FOTO + 1e-9));
}

// tomas = índices de las fotos con IA. La suma de las escenas es exactamente `duracion`.
export function repartirEscenas(duracion: number, fotos: number, tomas: number[]): Escena[] {
  if (fotos < 1) throw new Error("Elige al menos una foto.");
  if (tomas.length > MAX_TOMAS) throw new Error(`Puedes marcar máximo ${MAX_TOMAS} fotos con IA por video.`);
  if (new Set(tomas).size !== tomas.length || tomas.some((i) => !Number.isInteger(i) || i < 0 || i >= fotos)) {
    throw new Error("Las fotos con IA no son válidas.");
  }
  const otras = fotos - tomas.length;
  const resto = duracion - tomas.length * SEGUNDOS_TOMA;
  if (otras === 0) {
    if (Math.abs(resto) > 1e-9) throw new Error(`Las tomas con IA duran ${SEGUNDOS_TOMA} s cada una. Agrega al menos una foto sin IA para llenar el video.`);
  } else if (resto / otras < MIN_FOTO - 1e-9) {
    throw new Error(`En ${duracion} s caben máximo ${maxFotos(duracion, tomas.length)} fotos. Quita fotos o elige un video más largo.`);
  }
  const cada = otras > 0 ? resto / otras : 0;
  return Array.from({ length: fotos }, (_, indice): Escena =>
    tomas.includes(indice) ? { tipo: "toma", indice, segundos: SEGUNDOS_TOMA } : { tipo: "foto", indice, segundos: cada },
  );
}

// Escenas + cierre con la marca: el cierre (p. ej. 3 s) va dentro de la duración si caben las fotos;
// si no caben, el video va sin cierre. Lanza el mismo error claro si ni así caben.
export function planDeEscenas(duracion: number, fotos: number, tomas: number[], cierre: number): { escenas: Escena[]; cierre: number } {
  try {
    if (cierre > 0) return { escenas: repartirEscenas(duracion - cierre, fotos, tomas), cierre };
  } catch {
    // no cabe con cierre: se intenta sin él
  }
  return { escenas: repartirEscenas(duracion, fotos, tomas), cierre: 0 };
}
