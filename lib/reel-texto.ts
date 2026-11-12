import type { TextoPos, TextoTam } from "./linea-tiempo";

// Dónde va y qué tan grande es el texto en pantalla de un clip.
// centroY: fracción del alto del video; tamano: fracción del lado corto.
const CENTRO: Record<TextoPos, number> = { arriba: 0.2, centro: 0.5, abajo: 0.7 };
const TAMANO: Record<TextoTam, number> = { chico: 0.046, normal: 0.058, grande: 0.072 };

export function medidasTexto(pos: TextoPos, tam: TextoTam, vertical: boolean): { centroY: number; tamano: number } {
  // En cuadrado y horizontal el texto de abajo sube un poco para dejar sitio a los subtítulos
  const centroY = pos === "abajo" && !vertical ? 0.66 : CENTRO[pos];
  return { centroY, tamano: TAMANO[tam] };
}
