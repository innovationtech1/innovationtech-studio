// Galería: el tamaño de las miniaturas y el aviso cuando algo no se pudo guardar.
// Solo reglas, sin pantalla (app/page.tsx y lib/use-gallery.ts).

export const TAMANOS_GALERIA = ["chico", "mediano", "grande"] as const;
export type TamanoGaleria = (typeof TAMANOS_GALERIA)[number];

const ANCHO: Record<TamanoGaleria, number> = { chico: 88, mediano: 140, grande: 240 };

// Ancho mínimo de cada miniatura (px): de ahí sale cuántas caben por fila
export const anchoMinimo = (t: TamanoGaleria): number => ANCHO[t];

export const limpiarTamano = (v: unknown): TamanoGaleria => ((TAMANOS_GALERIA as readonly unknown[]).includes(v) ? (v as TamanoGaleria) : "mediano");

const esSinEspacio = (e: unknown) => {
  const x = e as { name?: unknown; message?: unknown } | null;
  return x?.name === "QuotaExceededError" || (typeof x?.message === "string" && /quota|espacio/i.test(x.message));
};

// Por qué no se pudo guardar, dicho con verdad. `uso`: lo que Studio ocupa y lo que el navegador le deja.
// Si a Studio le sobra lugar y aun así no hay espacio, el lleno es el disco del aparato: borrar cosas de
// la galería no lo arregla.
export function avisoDeGaleria(error: unknown, uso: { used: number; quota: number } | null): string {
  if (!esSinEspacio(error)) {
    return "No se pudo guardar en la galería en este momento. Descarga lo que quieras conservar y vuelve a intentarlo.";
  }
  if (uso && uso.quota > 0 && uso.used < uso.quota * 0.8) {
    return "No se pudo guardar en la galería: el disco de tu dispositivo está casi lleno. Descarga lo que quieras conservar y libera espacio en el dispositivo (no solo en Studio).";
  }
  return "No se pudo guardar en la galería: el dispositivo se quedó sin espacio. Borra algunos elementos.";
}
