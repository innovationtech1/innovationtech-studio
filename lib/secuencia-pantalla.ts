// Pantalla «Crear secuencia de fotos»: funciones puras (sin pantalla ni red) para poder probarlas.
// La pantalla está en app/secuencia-fotos.tsx; las ideas y el guion vienen de lib/secuencia.ts.

import { ESTILOS_FOTO, MAX_FOTOS, type IdeaFoto } from "./secuencia";

// Hacen falta al menos 2 fotos para «Hacer el video con NOVA»
export const MIN_FOTOS_VIDEO = 2;

// Una idea en pantalla: id fijo (para moverla sin perder su foto) y el id de su foto en el aparato (IndexedDB).
export type IdeaSecuencia = IdeaFoto & { id: string; foto?: string; fallo?: boolean };

// Sube (-1) o baja (+1) una idea; si no se puede, devuelve la misma lista.
export function moverIdea<T>(lista: T[], i: number, paso: -1 | 1): T[] {
  const j = i + paso;
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return lista;
  const copia = lista.slice();
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

// Hasta MAX_FOTOS momentos
export const agregarIdea = <T>(lista: T[], nueva: T): T[] => (lista.length >= MAX_FOTOS ? lista : [...lista, nueva]);

// Siempre queda al menos un momento
export const quitarIdea = <T>(lista: T[], i: number): T[] => (lista.length <= 1 ? lista : lista.filter((_, k) => k !== i));

// La descripción en inglés que va a /api/image, siempre con el sufijo del estilo elegido ahora
// (si el prompt trae el de otro estilo, se cambia). Sin descripción se arma con el momento y la historia.
export function promptDeFoto(idea: { momento: string; prompt: string }, tema: string, estilo: string): string {
  const sufijo = (ESTILOS_FOTO.find((e) => e.id === estilo) ?? ESTILOS_FOTO[0]).sufijo;
  let base = idea.prompt.trim();
  for (const e of ESTILOS_FOTO) {
    if (base.endsWith(e.sufijo)) {
      base = base.slice(0, -e.sufijo.length).replace(/[\s,]+$/, "");
      break;
    }
  }
  if (!base) base = [idea.momento.trim(), tema.trim()].filter(Boolean).join(", ");
  return base ? `${base}, ${sufijo}` : "";
}

// «Esto usa N imágenes de tu límite (te quedan M). ¿Las creo?»; sin cuentas, sin «te quedan».
export function textoConfirmarFotos(n: number, quedan?: number): string {
  const uso = n === 1 ? "1 imagen" : `${n} imágenes`;
  const resto = typeof quedan === "number" ? (quedan === 1 ? " (te queda 1)" : ` (te quedan ${quedan})`) : "";
  return `Esto usa ${uso} de tu límite${resto}. ${n === 1 ? "¿La creo?" : "¿Las creo?"}`;
}

export const textoProgreso = (i: number, total: number) => `Foto ${i} de ${total}…`;

// Cuánto le queda de un contador (lo del mes + saldo de paquetes); undefined sin cuenta o si su plan no lo tiene.
export function quedanDe(
  c: { limites: Record<string, number>; uso: Record<string, number>; saldo: Record<string, number | undefined> } | null | undefined,
  k: string
): number | undefined {
  if (!c) return undefined;
  const limite = c.limites[k];
  const saldo = c.saldo[k] ?? 0;
  if (limite === undefined && !saldo) return undefined;
  return Math.max(0, (limite ?? 0) - (c.uso[k] ?? 0)) + saldo;
}

// Lo que se manda al Creador de Reels: solo las ideas que ya tienen su foto cargada, en orden.
export function fotosParaVideo(ideas: IdeaSecuencia[], urls: Record<string, string>): { momentos: string[]; fotos: string[] } {
  const listas = ideas.filter((x) => x.foto && urls[x.foto]);
  // El guion necesita un momento por foto: si quedó vacío, «Foto N».
  return { momentos: listas.map((x, i) => x.momento.trim() || `Foto ${i + 1}`), fotos: listas.map((x) => urls[x.foto!]) };
}
