// Transiciones entre un clip y el siguiente. Módulo puro: dice cómo dibujar el clip que entra
// en cada momento de la transición (p va de 0 a 1).

export type Transicion = "fundido" | "corte" | "deslizar" | "zoom" | "destello" | "barrido";

export const TRANSICIONES: { id: Transicion; nombre: string }[] = [
  { id: "fundido", nombre: "Fundido" },
  { id: "corte", nombre: "Corte" },
  { id: "deslizar", nombre: "Deslizar" },
  { id: "zoom", nombre: "Zoom" },
  { id: "destello", nombre: "Destello" },
  { id: "barrido", nombre: "Barrido" },
];

export const esTransicion = (v: unknown): v is Transicion => TRANSICIONES.some((t) => t.id === v);

// Cómo se dibuja el clip que entra:
// alfa: qué tan visible (0 a 1) · dx: corrimiento a la derecha (fracción del ancho) · escala: tamaño
// recorte: qué parte del ancho se ve, desde la izquierda (0 a 1) · blanco: destello encima de todo (0 a 1)
export type PasoTransicion = { alfa: number; dx: number; escala: number; recorte: number; blanco: number };

export function pasoTransicion(tipo: Transicion, avance: number): PasoTransicion {
  const p = Math.min(1, Math.max(0, avance));
  const paso: PasoTransicion = { alfa: 0, dx: 0, escala: 1, recorte: 1, blanco: 0 };
  switch (tipo) {
    case "corte":
      return paso;
    case "fundido":
      return { ...paso, alfa: p };
    case "deslizar":
      return { ...paso, alfa: 1, dx: Math.pow(1 - p, 2) }; // desacelera al llegar
    case "zoom":
      return { ...paso, alfa: p, escala: Math.round((1.3 - 0.3 * p) * 1000) / 1000 };
    case "destello":
      return { ...paso, alfa: p >= 0.5 ? 1 : 0, blanco: Math.round((1 - Math.abs(p - 0.5) * 2) * 1000) / 1000 };
    case "barrido":
      return { ...paso, alfa: 1, recorte: p };
  }
}
