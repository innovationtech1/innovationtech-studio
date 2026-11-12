// Cómo se dibuja cada transición en el lienzo del reel. Cada una recibe el clip que sale, el que entra
// y el avance (0 a 1), y pinta el cuadro completo. Para agregar una transición: una entrada aquí y
// otra en el catálogo (lib/reel-transicion.ts).

import { suave, type Transicion } from "./reel-transicion";

export type CuadroTransicion = {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  p: number; // avance de 0 a 1
  sale: () => void; // dibuja el clip que termina, a pantalla completa
  entra: () => void; // dibuja el clip que sigue, a pantalla completa
  acento: string; // color de la marca
};

type Dibujante = (c: CuadroTransicion) => void;

// Dibuja `que` dentro de una transformación o recorte, sin dejar rastro en el lienzo
function con(ctx: CanvasRenderingContext2D, preparar: () => void, que: () => void) {
  ctx.save();
  preparar();
  que();
  ctx.restore();
}

// El clip que entra se desliza encima desde un lado. (dx, dy): de dónde viene, en pantallas.
const deslizar =
  (dx: number, dy: number): Dibujante =>
  ({ ctx, W, H, p, sale, entra }) => {
    const falta = 1 - suave(p);
    sale();
    con(ctx, () => ctx.translate(dx * W * falta, dy * H * falta), entra);
  };

// El clip que entra empuja al que sale: los dos se mueven juntos.
const empujar =
  (dx: number, dy: number): Dibujante =>
  ({ ctx, W, H, p, sale, entra }) => {
    const e = suave(p);
    con(ctx, () => ctx.translate(-dx * W * e, -dy * H * e), sale);
    con(ctx, () => ctx.translate(dx * W * (1 - e), dy * H * (1 - e)), entra);
  };

// El clip que entra se va descubriendo dentro de una zona que crece (rectángulo, círculo, franjas…)
const descubrir =
  (zona: (ctx: CanvasRenderingContext2D, W: number, H: number, e: number) => void): Dibujante =>
  ({ ctx, W, H, p, sale, entra }) => {
    sale();
    con(
      ctx,
      () => {
        ctx.beginPath();
        zona(ctx, W, H, suave(p));
        ctx.clip();
      },
      entra,
    );
  };

const desdeElCentro = (ctx: CanvasRenderingContext2D, W: number, H: number, escala: number, giro = 0) => {
  ctx.translate(W / 2, H / 2);
  if (giro) ctx.rotate(giro);
  ctx.scale(escala, escala);
  ctx.translate(-W / 2, -H / 2);
};

const velo = (ctx: CanvasRenderingContext2D, W: number, H: number, color: string, alfa: number) => {
  if (alfa <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alfa);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
};

// Sube hasta 1 a la mitad de la transición y vuelve a bajar
const pico = (p: number) => 1 - Math.abs(p - 0.5) * 2;

const DIBUJANTES: Record<Transicion, Dibujante> = {
  corte: ({ sale }) => sale(),
  fundido: ({ ctx, p, sale, entra }) => {
    sale();
    con(ctx, () => (ctx.globalAlpha = p), entra);
  },

  // Movimiento
  deslizar: deslizar(1, 0),
  "deslizar-der": deslizar(-1, 0),
  "deslizar-arriba": deslizar(0, 1),
  "deslizar-abajo": deslizar(0, -1),
  empujar: empujar(1, 0),
  "empujar-der": empujar(-1, 0),
  "empujar-arriba": empujar(0, 1),
  "empujar-abajo": empujar(0, -1),
  barrido: descubrir((ctx, W, H, e) => ctx.rect(0, 0, W * e, H)),
  "barrido-izq": descubrir((ctx, W, H, e) => ctx.rect(W * (1 - e), 0, W * e, H)),
  "barrido-abajo": descubrir((ctx, W, H, e) => ctx.rect(0, 0, W, H * e)),
  "barrido-arriba": descubrir((ctx, W, H, e) => ctx.rect(0, H * (1 - e), W, H * e)),

  // Formas
  circulo: descubrir((ctx, W, H, e) => ctx.arc(W / 2, H / 2, (Math.hypot(W, H) / 2) * e, 0, Math.PI * 2)),
  persianas: descubrir((ctx, W, H, e) => {
    const franjas = 7;
    const alto = H / franjas;
    for (let k = 0; k < franjas; k++) ctx.rect(0, k * alto, W, alto * e + 1);
  }),
  cortina: descubrir((ctx, W, H, e) => ctx.rect((W / 2) * (1 - e), 0, W * e, H)),
  diagonal: descubrir((ctx, W, H, e) => {
    const k = (W + H) * e;
    ctx.moveTo(0, 0);
    ctx.lineTo(k, 0);
    ctx.lineTo(0, k);
    ctx.closePath();
  }),

  // Zoom y giro
  zoom: ({ ctx, W, H, p, sale, entra }) => {
    sale();
    con(
      ctx,
      () => {
        ctx.globalAlpha = p;
        desdeElCentro(ctx, W, H, 1.3 - 0.3 * p);
      },
      entra,
    );
  },
  // El golpe de acercamiento: el que sale se lanza hacia la cámara y el que entra aterriza desde cerca
  "zoom-rapido": ({ ctx, W, H, p, sale, entra }) => {
    if (p < 0.5) {
      const t = p / 0.5;
      con(ctx, () => desdeElCentro(ctx, W, H, 1 + 0.8 * t * t), sale);
      velo(ctx, W, H, "#fff", (t - 0.7) / 0.6);
    } else {
      const t = (p - 0.5) / 0.5;
      con(ctx, () => desdeElCentro(ctx, W, H, 1.8 - 0.8 * (1 - Math.pow(1 - t, 3))), entra);
      velo(ctx, W, H, "#fff", 0.5 - t * 1.6);
    }
  },
  giro: ({ ctx, W, H, p, sale, entra }) => {
    const e = suave(p);
    sale();
    con(
      ctx,
      () => {
        ctx.globalAlpha = Math.min(1, e * 1.4);
        // Agrandado mientras gira para que nunca se vean las esquinas vacías
        desdeElCentro(ctx, W, H, 1 + 0.9 * (1 - e), -0.5 * (1 - e));
      },
      entra,
    );
  },

  // Efectos
  destello: ({ ctx, W, H, p, sale, entra }) => {
    (p < 0.5 ? sale : entra)();
    velo(ctx, W, H, "#fff", pico(p));
  },
  negro: ({ ctx, W, H, p, sale, entra }) => {
    (p < 0.5 ? sale : entra)();
    velo(ctx, W, H, "#000", pico(p));
  },
  // Interferencia: franjas de la imagen se corren de lado y se tiñen, más fuerte a la mitad
  glitch: ({ ctx, W, H, p, sale, entra }) => {
    (p < 0.5 ? sale : entra)();
    const fuerza = pico(p);
    if (fuerza <= 0.02) return;
    const paso = Math.floor(p * 14); // cambia de dibujo unas 14 veces durante la transición
    const azar = (n: number) => {
      const x = Math.sin((paso + 1) * 12.9898 + n * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let k = 0; k < 7; k++) {
      const y = Math.floor(azar(k) * H);
      const alto = Math.max(4, Math.floor(H * (0.02 + azar(k + 20) * 0.09)));
      const corre = Math.round((azar(k + 40) - 0.5) * W * 0.35 * fuerza);
      ctx.drawImage(ctx.canvas, 0, y, W, alto, corre, y, W, alto);
      ctx.save();
      ctx.globalAlpha = 0.28 * fuerza;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = k % 2 ? "#00e5ff" : "#ff2d6f";
      ctx.fillRect(0, y, W, alto);
      ctx.restore();
    }
  },

  // Exclusiva de Studio. Una franja diagonal con el color de la marca cruza la pantalla con un filo
  // de luz, y detrás de ella va quedando el clip siguiente.
  rafaga: ({ ctx, W, H, p, sale, entra, acento }) => {
    const e = suave(p);
    const inclina = Math.min(H * 0.32, W * 0.45); // cuánto se recuesta la franja
    const ancho = W * 0.34;
    // Borde delantero, medido arriba. Empieza fuera de la pantalla por la izquierda y termina cuando
    // la cola ya salió por la derecha también abajo (así al acabar solo se ve el clip nuevo).
    const frente = (W + inclina + ancho) * e;
    const cola = frente - ancho;
    const franja = (x0: number, x1: number) => {
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x1, 0);
      ctx.lineTo(x1 - inclina, H);
      ctx.lineTo(x0 - inclina, H);
      ctx.closePath();
    };
    sale();
    // Lo que ya pasó la franja muestra el clip nuevo
    con(
      ctx,
      () => {
        franja(-W, cola + 1);
        ctx.clip();
      },
      entra,
    );
    ctx.save();
    const tinte = ctx.createLinearGradient(cola, 0, frente, 0);
    tinte.addColorStop(0, acento);
    tinte.addColorStop(1, "#ffffff");
    franja(cola, frente);
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = acento;
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = tinte;
    ctx.fill();
    // filo de luz al frente y una estela fina detrás
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#ffffff";
    franja(frente - W * 0.012, frente);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    franja(cola - W * 0.05, cola - W * 0.035);
    ctx.fillStyle = acento;
    ctx.fill();
    ctx.restore();
  },
};

export function dibujarTransicion(tipo: Transicion, cuadro: CuadroTransicion) {
  (DIBUJANTES[tipo] ?? DIBUJANTES.fundido)({ ...cuadro, p: Math.min(1, Math.max(0, cuadro.p)) });
}
