// Figuras para recortar imágenes. Cada una devuelve un Path2D dentro de una caja w × h.

export type ShapeId =
  | "circle"
  | "square"
  | "rounded"
  | "squircle"
  | "pill"
  | "arch"
  | "triangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "star"
  | "heart"
  | "blob"
  | "leaf"
  | "drop"
  | "scallop"
  | "wave"
  | "ticket"
  | "bubble"
  | "shield"
  | "flower"
  | "cross";

export const SHAPES: { id: ShapeId; label: string; ratio?: number }[] = [
  { id: "circle", label: "Círculo" },
  { id: "square", label: "Cuadrado" },
  { id: "rounded", label: "Redondeado" },
  { id: "squircle", label: "Squircle" },
  { id: "arch", label: "Arco", ratio: 1.3 },
  { id: "pill", label: "Píldora", ratio: 0.55 },
  { id: "blob", label: "Orgánica" },
  { id: "leaf", label: "Hoja" },
  { id: "heart", label: "Corazón" },
  { id: "star", label: "Estrella" },
  { id: "flower", label: "Flor" },
  { id: "scallop", label: "Sello" },
  { id: "hexagon", label: "Hexágono" },
  { id: "pentagon", label: "Pentágono" },
  { id: "triangle", label: "Triángulo" },
  { id: "diamond", label: "Rombo" },
  { id: "drop", label: "Gota", ratio: 1.2 },
  { id: "shield", label: "Escudo", ratio: 1.15 },
  { id: "bubble", label: "Burbuja" },
  { id: "ticket", label: "Ticket", ratio: 0.6 },
  { id: "wave", label: "Ola" },
  { id: "cross", label: "Cruz" },
];

export type ShapeParams = {
  radius: number; // 0..50 (% del lado corto) para redondeados
  points: number; // estrella / flor / sello
  seed: number; // variación de la forma orgánica
};

// Rectángulo con esquinas redondeadas independientes (compatible con todos los navegadores)
function roundRectPath(p: Path2D, x: number, y: number, w: number, h: number, r: [number, number, number, number]) {
  const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v, w / 2, h / 2)));
  p.moveTo(x + tl, y);
  p.lineTo(x + w - tr, y);
  p.arcTo(x + w, y, x + w, y + tr, tr);
  p.lineTo(x + w, y + h - br);
  p.arcTo(x + w, y + h, x + w - br, y + h, br);
  p.lineTo(x + bl, y + h);
  p.arcTo(x, y + h, x, y + h - bl, bl);
  p.lineTo(x, y + tl);
  p.arcTo(x, y, x + tl, y, tl);
  p.closePath();
}

// Curva suave que pasa por todos los puntos (Catmull-Rom cerrada)
function smoothClosed(p: Path2D, pts: [number, number][]) {
  const n = pts.length;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    p.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
      p2[0],
      p2[1]
    );
  }
  p.closePath();
}

function polar(w: number, h: number, n: number, r: (t: number) => number, rot = -Math.PI / 2): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = rot + (i / n) * Math.PI * 2;
    const k = r(t - rot);
    out.push([w / 2 + (Math.cos(t) * k * w) / 2, h / 2 + (Math.sin(t) * k * h) / 2]);
  }
  return out;
}

function poly(p: Path2D, pts: [number, number][]) {
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
}

// Ajusta un conjunto de puntos para que ocupe toda la caja
function fit(pts: [number, number][], w: number, h: number): [number, number][] {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const sx = w / (Math.max(...xs) - x0 || 1);
  const sy = h / (Math.max(...ys) - y0 || 1);
  return pts.map(([x, y]) => [(x - x0) * sx, (y - y0) * sy]);
}

function rand(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function shapePath(id: ShapeId, w: number, h: number, o: ShapeParams): Path2D {
  const p = new Path2D();
  const m = Math.min(w, h);
  switch (id) {
    case "circle":
      p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "square":
      p.rect(0, 0, w, h);
      break;
    case "rounded": {
      const r = (o.radius / 100) * m;
      roundRectPath(p, 0, 0, w, h, [r, r, r, r]);
      break;
    }
    case "pill":
      roundRectPath(p, 0, 0, w, h, [m / 2, m / 2, m / 2, m / 2]);
      break;
    case "squircle": {
      // Superelipse (como los íconos de apps)
      const pts: [number, number][] = [];
      const n = 4.5;
      for (let i = 0; i < 160; i++) {
        const t = (i / 160) * Math.PI * 2;
        const c = Math.cos(t);
        const s = Math.sin(t);
        pts.push([w / 2 + (w / 2) * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), h / 2 + (h / 2) * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]);
      }
      poly(p, pts);
      break;
    }
    case "arch": {
      const r = w / 2;
      p.moveTo(0, h);
      p.lineTo(0, Math.min(r, h));
      p.arc(w / 2, Math.min(r, h), r, Math.PI, 0);
      p.lineTo(w, h);
      p.closePath();
      break;
    }
    case "triangle":
      poly(p, [
        [w / 2, 0],
        [w, h],
        [0, h],
      ]);
      break;
    case "diamond":
      poly(p, [
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ]);
      break;
    case "pentagon":
      poly(p, fit(polar(w, h, 5, () => 1), w, h));
      break;
    case "hexagon":
      poly(p, fit(polar(w, h, 6, () => 1, 0), w, h));
      break;
    case "star": {
      const n = Math.max(4, o.points);
      const pts = polar(w, h, n * 2, (t) => (Math.round(t / (Math.PI / n)) % 2 ? 0.48 : 1));
      poly(p, fit(pts, w, h));
      break;
    }
    case "flower": {
      const n = Math.max(4, Math.min(12, o.points));
      smoothClosed(p, fit(polar(w, h, n * 12, (t) => 0.72 + 0.28 * Math.abs(Math.cos((n * t) / 2))), w, h));
      break;
    }
    case "scallop": {
      const n = Math.max(10, o.points * 2);
      smoothClosed(p, fit(polar(w, h, n * 8, (t) => 0.94 + 0.06 * Math.cos(n * t)), w, h));
      break;
    }
    case "blob": {
      const r = rand(o.seed);
      const a = [r() * 6, r() * 6, r() * 6];
      smoothClosed(
        p,
        fit(
          polar(w, h, 90, (t) => 0.8 + 0.1 * Math.sin(2 * t + a[0]) + 0.07 * Math.sin(3 * t + a[1]) + 0.04 * Math.sin(5 * t + a[2])),
          w,
          h
        )
      );
      break;
    }
    case "leaf": {
      const r = m * 0.9;
      roundRectPath(p, 0, 0, w, h, [r, 0, r, 0]);
      break;
    }
    case "heart": {
      p.moveTo(w / 2, h * 0.3);
      p.bezierCurveTo(w * 0.5, h * 0.1, w * 0.15, -h * 0.02, w * 0.02, h * 0.22);
      p.bezierCurveTo(-w * 0.08, h * 0.45, w * 0.2, h * 0.68, w / 2, h);
      p.bezierCurveTo(w * 0.8, h * 0.68, w * 1.08, h * 0.45, w * 0.98, h * 0.22);
      p.bezierCurveTo(w * 0.85, -h * 0.02, w * 0.5, h * 0.1, w / 2, h * 0.3);
      p.closePath();
      break;
    }
    case "drop": {
      const rr = Math.min(w / 2, h * 0.38);
      const cx = w / 2;
      const cy = h - rr;
      const d = cy;
      const b = Math.acos(Math.min(1, rr / d));
      p.moveTo(cx, 0);
      p.lineTo(cx + rr * Math.cos(-Math.PI / 2 + b), cy + rr * Math.sin(-Math.PI / 2 + b));
      p.arc(cx, cy, rr, -Math.PI / 2 + b, (3 * Math.PI) / 2 - b);
      p.closePath();
      break;
    }
    case "shield": {
      const r = m * 0.08;
      p.moveTo(r, 0);
      p.lineTo(w - r, 0);
      p.quadraticCurveTo(w, 0, w, r);
      p.lineTo(w, h * 0.45);
      p.bezierCurveTo(w, h * 0.75, w * 0.7, h * 0.9, w / 2, h);
      p.bezierCurveTo(w * 0.3, h * 0.9, 0, h * 0.75, 0, h * 0.45);
      p.lineTo(0, r);
      p.quadraticCurveTo(0, 0, r, 0);
      p.closePath();
      break;
    }
    case "bubble": {
      const bh = h * 0.84;
      const r = m * 0.16;
      p.moveTo(r, 0);
      p.lineTo(w - r, 0);
      p.arcTo(w, 0, w, r, r);
      p.lineTo(w, bh - r);
      p.arcTo(w, bh, w - r, bh, r);
      p.lineTo(w * 0.32, bh);
      p.lineTo(w * 0.12, h);
      p.lineTo(w * 0.16, bh);
      p.lineTo(r, bh);
      p.arcTo(0, bh, 0, bh - r, r);
      p.lineTo(0, r);
      p.arcTo(0, 0, r, 0, r);
      p.closePath();
      break;
    }
    case "ticket": {
      const n = m * 0.14;
      const r = m * 0.06;
      p.moveTo(r, 0);
      p.lineTo(w - r, 0);
      p.arcTo(w, 0, w, r, r);
      p.lineTo(w, h / 2 - n);
      p.arc(w, h / 2, n, -Math.PI / 2, Math.PI / 2, true);
      p.lineTo(w, h - r);
      p.arcTo(w, h, w - r, h, r);
      p.lineTo(r, h);
      p.arcTo(0, h, 0, h - r, r);
      p.lineTo(0, h / 2 + n);
      p.arc(0, h / 2, n, Math.PI / 2, -Math.PI / 2, true);
      p.lineTo(0, r);
      p.arcTo(0, 0, r, 0, r);
      p.closePath();
      break;
    }
    case "wave": {
      const amp = h * 0.06;
      p.moveTo(0, amp);
      for (let x = 0; x <= w; x += w / 60) p.lineTo(x, amp + Math.sin((x / w) * Math.PI * 4) * amp);
      for (let x = w; x >= 0; x -= w / 60) p.lineTo(x, h - amp + Math.sin((x / w) * Math.PI * 4 + 1) * amp);
      p.closePath();
      break;
    }
    case "cross": {
      const t = 0.34;
      const r = m * 0.06;
      // Cruz con esquinas redondeadas (dos rectángulos)
      roundRectPath(p, w * t, 0, w * (1 - 2 * t), h, [r, r, r, r]);
      roundRectPath(p, 0, h * t, w, h * (1 - 2 * t), [r, r, r, r]);
      break;
    }
  }
  return p;
}
