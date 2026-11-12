// Transiciones entre un clip y el siguiente: el catálogo, sus duraciones y el reparto al azar.
// Módulo puro (con pruebas). Cómo se dibuja cada una está en lib/reel-transicion-dibujo.ts.

export type Transicion =
  | "fundido"
  | "corte"
  | "deslizar" // entra por la derecha (la de siempre)
  | "deslizar-der"
  | "deslizar-arriba"
  | "deslizar-abajo"
  | "empujar"
  | "empujar-der"
  | "empujar-arriba"
  | "empujar-abajo"
  | "barrido" // se descubre de izquierda a derecha (la de siempre)
  | "barrido-izq"
  | "barrido-abajo"
  | "barrido-arriba"
  | "circulo"
  | "persianas"
  | "cortina"
  | "diagonal"
  | "zoom"
  | "zoom-rapido"
  | "giro"
  | "destello"
  | "negro"
  | "glitch"
  | "rafaga";

export type InfoTransicion = { id: Transicion; nombre: string; icono: string };

// Las flechas dicen hacia dónde se mueve la imagen
export const GRUPOS_TRANSICION: { id: string; nombre: string; transiciones: InfoTransicion[] }[] = [
  {
    id: "basicas",
    nombre: "Básicas",
    transiciones: [
      { id: "fundido", nombre: "Fundido", icono: "◐" },
      { id: "corte", nombre: "Corte", icono: "▮▮" },
    ],
  },
  {
    id: "movimiento",
    nombre: "Movimiento",
    transiciones: [
      { id: "deslizar", nombre: "Deslizar ←", icono: "⇠" },
      { id: "deslizar-der", nombre: "Deslizar →", icono: "⇢" },
      { id: "deslizar-arriba", nombre: "Deslizar ↑", icono: "⇡" },
      { id: "deslizar-abajo", nombre: "Deslizar ↓", icono: "⇣" },
      { id: "empujar", nombre: "Empujar ←", icono: "⇐" },
      { id: "empujar-der", nombre: "Empujar →", icono: "⇒" },
      { id: "empujar-arriba", nombre: "Empujar ↑", icono: "⇑" },
      { id: "empujar-abajo", nombre: "Empujar ↓", icono: "⇓" },
      { id: "barrido", nombre: "Barrido →", icono: "▶" },
      { id: "barrido-izq", nombre: "Barrido ←", icono: "◀" },
      { id: "barrido-abajo", nombre: "Barrido ↓", icono: "▼" },
      { id: "barrido-arriba", nombre: "Barrido ↑", icono: "▲" },
    ],
  },
  {
    id: "formas",
    nombre: "Formas",
    transiciones: [
      { id: "circulo", nombre: "Círculo", icono: "◉" },
      { id: "persianas", nombre: "Persianas", icono: "☰" },
      { id: "cortina", nombre: "Cortina", icono: "◫" },
      { id: "diagonal", nombre: "Diagonal", icono: "◩" },
    ],
  },
  {
    id: "zoom",
    nombre: "Zoom y giro",
    transiciones: [
      { id: "zoom", nombre: "Zoom", icono: "⊕" },
      { id: "zoom-rapido", nombre: "Zoom rápido", icono: "⚡" },
      { id: "giro", nombre: "Giro", icono: "↻" },
    ],
  },
  {
    id: "efectos",
    nombre: "Efectos",
    transiciones: [
      { id: "destello", nombre: "Destello", icono: "✦" },
      { id: "negro", nombre: "A negro", icono: "●" },
      { id: "glitch", nombre: "Interferencia", icono: "≋" },
    ],
  },
  {
    id: "exclusiva",
    nombre: "Exclusiva de Studio",
    transiciones: [{ id: "rafaga", nombre: "Ráfaga de marca", icono: "⟋" }],
  },
];

export const TRANSICIONES: InfoTransicion[] = GRUPOS_TRANSICION.flatMap((g) => g.transiciones);
export const esTransicion = (v: unknown): v is Transicion => TRANSICIONES.some((t) => t.id === v);
export const nombreTransicion = (id: Transicion) => TRANSICIONES.find((t) => t.id === id)?.nombre ?? id;

// ---------- Duración ----------

export type DuracionTransicion = "rapida" | "normal" | "lenta";
export const SEGUNDOS_TRANSICION: Record<DuracionTransicion, number> = { rapida: 0.3, normal: 0.6, lenta: 1 };
export const esDuracionTransicion = (v: unknown): v is DuracionTransicion => v === "rapida" || v === "normal" || v === "lenta";

// Cuánto dura la transición al final de un clip: lo elegido, sin comerse más de un tercio del clip
export function duracionTransicion(elegida: DuracionTransicion | undefined, segundosDelClip: number): number {
  return Math.min(SEGUNDOS_TRANSICION[elegida ?? "normal"], segundosDelClip / 3);
}

// ---------- Movimiento ----------

// De 0 a 1 arrancando y frenando con suavidad
export function suave(p: number): number {
  const t = Math.min(1, Math.max(0, p));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ---------- «Sorpréndeme» ----------

// Una transición distinta para cada clip: variadas, sin dos iguales seguidas y sin cortes secos.
export function repartirAlAzar(clips: number, azar: () => number = Math.random): Transicion[] {
  const opciones = TRANSICIONES.map((t) => t.id).filter((id) => id !== "corte");
  const r: Transicion[] = [];
  for (let i = 0; i < clips; i++) {
    let k = Math.min(opciones.length - 1, Math.floor(azar() * opciones.length));
    if (opciones[k] === r[i - 1]) k = (k + 1 + (i % 3)) % opciones.length;
    if (opciones[k] === r[i - 1]) k = (k + 1) % opciones.length;
    r.push(opciones[k]);
  }
  return r;
}
