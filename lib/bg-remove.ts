// Quitar fondo por color (ideal para logos con fondo blanco, negro o de un color).
// Todo ocurre en el navegador: gratis, instantáneo y sin enviar la imagen a ningún lado.

export type RGB = [number, number, number];

export type ColorRemoval = {
  auto: boolean; // quita el color del borde, empezando desde las orillas
  seeds: { x: number; y: number }[]; // puntos tocados por el usuario
  global: boolean; // quita el color en toda la imagen (agujeros dentro de letras, etc.)
  tolerance: number; // 0..100
  softness: number; // 0..100 (bordes suaves)
};

const dist = (d: Uint8ClampedArray, i: number, c: RGB) => {
  const dr = d[i] - c[0];
  const dg = d[i + 1] - c[1];
  const db = d[i + 2] - c[2];
  // Distancia ponderada (más parecida a como vemos los colores)
  return Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);
};

export function colorAt(img: ImageData, x: number, y: number): RGB {
  const i = (Math.round(y) * img.width + Math.round(x)) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

// Color de fondo más común en las orillas (agrupando colores parecidos).
export function borderColor(img: ImageData): RGB {
  const { width: W, height: H, data: d } = img;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    if (d[i + 3] < 128) return;
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += d[i];
    b.g += d[i + 1];
    b.b += d[i + 2];
    buckets.set(key, b);
  };
  const step = Math.max(1, Math.floor(Math.max(W, H) / 400));
  for (let x = 0; x < W; x += step) {
    add(x, 0);
    add(x, H - 1);
  }
  for (let y = 0; y < H; y += step) {
    add(0, y);
    add(W - 1, y);
  }
  let best = { n: 0, r: 255, g: 255, b: 255 };
  buckets.forEach((b) => {
    if (b.n > best.n) best = b;
  });
  return best.n ? [best.r / best.n, best.g / best.n, best.b / best.n] : [255, 255, 255];
}

export function hasTransparency(img: ImageData) {
  const d = img.data;
  for (let i = 3; i < d.length; i += 4 * 16) if (d[i] < 250) return true;
  return false;
}

export function removeByColor(src: ImageData, o: ColorRemoval): ImageData {
  const { width: W, height: H } = src;
  const d = src.data;
  const N = W * H;
  const alpha = new Float32Array(N);
  for (let p = 0; p < N; p++) alpha[p] = d[p * 4 + 3] / 255;
  const fringe = new Int16Array(N).fill(-1); // qué color de fondo «contaminó» cada borde

  const tol = (o.tolerance / 100) * 140;
  const soft = Math.max(1, (o.softness / 100) * 70);
  const limit = tol + soft;

  const targets: RGB[] = [];
  const apply = (p: number, dd: number, t: number) => {
    const r = dd <= tol ? 1 : 1 - (dd - tol) / soft;
    const a = 1 - r;
    if (a < alpha[p]) {
      alpha[p] = a;
      fringe[p] = t;
    }
  };

  // Relleno desde puntos de inicio, solo por píxeles parecidos y conectados
  const queue = new Int32Array(N);
  const flood = (starts: number[], c: RGB, t: number) => {
    const seen = new Uint8Array(N);
    let head = 0;
    let tail = 0;
    for (const p of starts) {
      if (seen[p]) continue;
      if (dist(d, p * 4, c) > limit) continue;
      seen[p] = 1;
      queue[tail++] = p;
    }
    while (head < tail) {
      const p = queue[head++];
      const dd = dist(d, p * 4, c);
      apply(p, dd, t);
      if (dd > tol) continue; // los bordes suaves no siguen expandiendo
      const x = p % W;
      const y = (p - x) / W;
      const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
      for (const q of nb) {
        if (q < 0 || seen[q]) continue;
        seen[q] = 1;
        if (dist(d, q * 4, c) <= limit) queue[tail++] = q;
      }
    }
  };

  if (o.auto) {
    const c = borderColor(src);
    targets.push(c);
    const starts: number[] = [];
    for (let x = 0; x < W; x++) starts.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) starts.push(y * W, y * W + W - 1);
    flood(starts, c, targets.length - 1);
  }
  for (const s of o.seeds) {
    const x = Math.max(0, Math.min(W - 1, Math.round(s.x)));
    const y = Math.max(0, Math.min(H - 1, Math.round(s.y)));
    const c = colorAt(src, x, y);
    targets.push(c);
    flood([y * W + x], c, targets.length - 1);
  }
  if (o.global) {
    targets.forEach((c, t) => {
      for (let p = 0; p < N; p++) {
        const dd = dist(d, p * 4, c);
        if (dd <= limit) apply(p, dd, t);
      }
    });
  }

  // Resultado: quita el «halo» del color de fondo en los bordes semitransparentes
  const out = new ImageData(W, H);
  const od = out.data;
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    const a = alpha[p];
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    const t = fringe[p];
    if (t >= 0 && a > 0.02 && a < 0.98) {
      const c = targets[t];
      r = (r - (1 - a) * c[0]) / a;
      g = (g - (1 - a) * c[1]) / a;
      b = (b - (1 - a) * c[2]) / a;
    }
    od[i] = r;
    od[i + 1] = g;
    od[i + 2] = b;
    od[i + 3] = Math.round(a * 255);
  }
  return out;
}

// Recorta los bordes totalmente transparentes (el logo queda ajustado a su tamaño).
export function trimTransparent(img: ImageData, pad = 4): ImageData {
  const { width: W, height: H, data: d } = img;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (d[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return img;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad);
  y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    const from = ((y + y0) * W + x0) * 4;
    out.data.set(d.subarray(from, from + w * 4), y * w * 4);
  }
  return out;
}

// ---------- IA para fotos (BiRefNet, licencia MIT) ----------
// Se descarga una sola vez (~115 MB) y queda guardada en el navegador.

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";
const MODEL = "onnx-community/BiRefNet_lite-ONNX";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let segmenterPromise: Promise<any> | null = null;

export async function removeWithAI(
  canvas: HTMLCanvasElement,
  onProgress: (msg: string) => void
): Promise<ImageData> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      onProgress("Cargando la IA…");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const T: any = await import(/* webpackIgnore: true */ TRANSFORMERS_URL);
      const files: Record<string, number> = {};
      const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status === "progress" && p.file && p.total) {
          files[p.file] = p.loaded! / p.total;
          if (/\.onnx/.test(p.file)) onProgress(`Descargando la IA (solo la primera vez): ${Math.round(files[p.file] * 100)}%`);
        }
      };
      const hasGPU = typeof navigator !== "undefined" && "gpu" in navigator;
      const attempts: Record<string, string>[] = hasGPU
        ? [{ device: "webgpu", dtype: "fp16" }, { device: "wasm", dtype: "fp16" }, { device: "wasm", dtype: "fp32" }]
        : [{ device: "wasm", dtype: "fp16" }, { device: "wasm", dtype: "fp32" }];
      let lastError: unknown;
      for (const a of attempts) {
        try {
          return await T.pipeline("background-removal", MODEL, { ...a, progress_callback });
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError;
    })();
    segmenterPromise.catch(() => (segmenterPromise = null));
  }

  let seg;
  try {
    seg = await segmenterPromise;
  } catch {
    throw new Error("No se pudo cargar la IA. Revisa tu conexión a internet e intenta de nuevo (la primera vez descarga ~115 MB).");
  }

  onProgress("Quitando el fondo con IA… (puede tardar unos segundos)");
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Imagen no válida"))), "image/png"));
  const url = URL.createObjectURL(blob);
  try {
    const result = await seg(url);
    // El resultado puede venir como imagen con transparencia o como máscara.
    const first = Array.isArray(result) ? result[0] : result;
    const raw = first?.mask ?? first;
    if (!raw?.toCanvas) throw new Error("Respuesta inesperada de la IA.");
    const rc: HTMLCanvasElement | OffscreenCanvas = raw.toCanvas();
    const W = canvas.width;
    const H = canvas.height;
    const tmp = document.createElement("canvas");
    tmp.width = W;
    tmp.height = H;
    const tctx = tmp.getContext("2d")!;
    tctx.drawImage(rc as CanvasImageSource, 0, 0, W, H);
    const resultData = tctx.getImageData(0, 0, W, H);
    const orig = canvas.getContext("2d")!.getImageData(0, 0, W, H);

    if (raw.channels === 4) return resultData; // ya trae el fondo transparente
    // Máscara de un canal: la usamos como transparencia sobre la foto original.
    const out = new ImageData(W, H);
    for (let i = 0; i < out.data.length; i += 4) {
      out.data[i] = orig.data[i];
      out.data[i + 1] = orig.data[i + 1];
      out.data[i + 2] = orig.data[i + 2];
      out.data[i + 3] = resultData.data[i];
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
