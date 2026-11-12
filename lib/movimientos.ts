// Movimientos para animar una foto con IA: los más usados en video publicitario, listos para tocar,
// y un «Sorpréndeme» que arma una combinación especial al azar. Módulo puro.
// El texto es lo que se le pide a la IA; queda escrito en el campo «Movimiento» y se puede editar.

export type Movimiento = { id: string; nombre: string; texto: string };

export const MOVIMIENTOS: Movimiento[] = [
  { id: "acercar", nombre: "Acercar", texto: "La cámara se acerca despacio al sujeto, con movimiento suave y cinematográfico" },
  { id: "alejar", nombre: "Alejar", texto: "La cámara se aleja despacio y revela toda la escena, con movimiento suave" },
  { id: "paneo-der", nombre: "Paneo derecha", texto: "La cámara recorre la escena lentamente de izquierda a derecha" },
  { id: "paneo-izq", nombre: "Paneo izquierda", texto: "La cámara recorre la escena lentamente de derecha a izquierda" },
  { id: "orbita", nombre: "Girar alrededor", texto: "La cámara gira lentamente alrededor del sujeto, mostrando su volumen y sus detalles" },
  { id: "subir", nombre: "Subir", texto: "La cámara sube despacio como en una grúa y muestra la escena desde arriba" },
  { id: "bajar", nombre: "Bajar", texto: "La cámara baja despacio desde arriba hasta quedar frente al sujeto" },
  { id: "detalle", nombre: "Primer plano", texto: "Acercamiento lento a los detalles, con el fondo desenfocado y mucha textura" },
  { id: "lenta", nombre: "Cámara lenta", texto: "Movimiento natural en cámara lenta, elegante y fluido, con la cámara casi quieta" },
  { id: "mano", nombre: "Cámara en mano", texto: "Cámara en mano con un movimiento ligero y natural, como grabado en el momento" },
  { id: "vida", nombre: "Dar vida", texto: "La cámara casi no se mueve; la escena cobra vida con movimientos sutiles y naturales del sujeto y del ambiente" },
  { id: "dramatico", nombre: "Dramático", texto: "Acercamiento rápido y dramático al sujeto, con energía y fondo en movimiento" },
];

// Para «Sorpréndeme»: una cámara + un ambiente + una luz
const CAMARAS = [
  "La cámara se acerca despacio al sujeto",
  "La cámara gira lentamente alrededor del sujeto",
  "La cámara se aleja y revela toda la escena",
  "La cámara sube despacio como en una grúa",
  "La cámara recorre la escena lentamente de lado",
  "Acercamiento lento a los detalles con el fondo desenfocado",
  "La cámara flota suavemente hacia adelante",
  "Movimiento en cámara lenta con la cámara casi quieta",
];
const AMBIENTES = [
  "mientras sube vapor suave",
  "con partículas de luz flotando en el aire",
  "con una brisa ligera que mueve todo suavemente",
  "con destellos que recorren la superficie",
  "mientras caen pequeñas chispas doradas",
  "con humo ligero que se mueve al fondo",
  "con el fondo cobrando vida en un movimiento sutil",
  "con reflejos que brillan y cambian",
];
const LUCES = [
  "luz dorada de atardecer",
  "rayos de luz cálida que entran de lado",
  "luz de cine con contraste suave",
  "brillo de neón al fondo",
  "luz natural brillante y limpia",
  "ambiente cálido y acogedor",
];

// Una combinación especial, distinta de la que ya está puesta. `azar` se puede fijar para probar.
export function movimientoAlAzar(actual = "", azar: () => number = Math.random): string {
  const elegir = <T,>(lista: T[], salto = 0) => lista[(Math.min(lista.length - 1, Math.floor(azar() * lista.length)) + salto) % lista.length];
  for (let salto = 0; salto < CAMARAS.length; salto++) {
    const t = `${elegir(CAMARAS, salto)}, ${elegir(AMBIENTES)}, ${elegir(LUCES)}. Estilo cinematográfico, movimiento fluido y realista.`;
    if (t !== actual.trim()) return t;
  }
  return MOVIMIENTOS[0].texto;
}
