"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ColorRemoval, hasTransparency, removeByColor, removeWithAI, trimTransparent } from "@/lib/bg-remove";

const MAX = 2048;
const HISTORY = 8;

type Tool = "wand" | "erase" | "restore" | "rect" | "lasso" | "pan";
type Pt = { x: number; y: number };

async function toImage(src: string): Promise<HTMLImageElement> {
  let url = src;
  if (!src.startsWith("data:") && !src.startsWith("blob:")) {
    const res = await fetch(src).catch(() => null);
    if (!res || !res.ok) throw new Error("No se pudo abrir la imagen.");
    url = URL.createObjectURL(await res.blob());
  }
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("La imagen no se pudo abrir."));
    im.src = url;
  });
}

// Quitar fondo (automático por color o con IA) + borrador manual (pincel, restaurar, rectángulo, lazo).
export default function BgRemover({
  src,
  title,
  onApply,
  onClose,
  startWithEraser = false,
}: {
  src: string;
  title: string;
  onApply: (pngDataUrl: string, size: { w: number; h: number }, info?: { trimmed: boolean }) => void;
  onClose: () => void;
  startWithEraser?: boolean; // abre como «Borrador» (sin quitar el fondo automáticamente)
}) {
  const [mode, setMode] = useState<"color" | "ia">("color");
  const [opts, setOpts] = useState<ColorRemoval>({ auto: !startWithEraser, seeds: [], global: false, tolerance: 25, softness: 30 });
  const [tool, setTool] = useState<Tool>(startWithEraser ? "erase" : "wand");
  const [brush, setBrush] = useState(40); // tamaño del pincel en píxeles de pantalla
  const [hardness, setHardness] = useState(70);
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState<Pt[] | null>(null); // área seleccionada (rectángulo o lazo)
  const [trim, setTrim] = useState(!startWithEraser);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [ready, setReady] = useState(false);
  const [aiResult, setAiResult] = useState<ImageData | null>(null);
  const [view, setView] = useState<"result" | "original">("result");
  const [, setTick] = useState(0);
  const [fitW, setFitW] = useState(0);

  const srcCanvas = useRef<HTMLCanvasElement | null>(null);
  const original = useRef<ImageData | null>(null);
  const base = useRef<ImageData | null>(null); // resultado automático (color o IA)
  const final = useRef<ImageData | null>(null); // base + retoques manuales
  const manual = useRef<Uint8Array | null>(null); // 255 = intacto, 0 = borrado
  const restore = useRef<Uint8Array | null>(null); // 1 = forzar píxel original
  const history = useRef<{ m: Uint8Array; r: Uint8Array }[]>([]);
  const preview = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<{ last: Pt | null; start: Pt | null; path: Pt[] }>({ last: null, start: null, path: [] });

  const W = original.current?.width || 1;
  const H = original.current?.height || 1;

  // ---------- Cargar la imagen ----------
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const im = await toImage(src);
        if (cancel) return;
        const k = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(im.naturalWidth * k);
        c.height = Math.round(im.naturalHeight * k);
        c.getContext("2d", { willReadFrequently: true })!.drawImage(im, 0, 0, c.width, c.height);
        srcCanvas.current = c;
        original.current = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
        const n = c.width * c.height;
        manual.current = new Uint8Array(n).fill(255);
        restore.current = new Uint8Array(n);
        if (!startWithEraser && hasTransparency(original.current)) setOpts((o) => ({ ...o, auto: false }));
        setReady(true);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [src, startWithEraser]);

  // Tamaño en pantalla (cabe en el ancho y en ~55% del alto)
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !ready) return;
    const calc = () => {
      const cw = el.clientWidth - 20;
      const maxH = window.innerHeight * 0.55;
      setFitW(Math.max(120, Math.min(cw, (maxH * W) / H)));
    };
    calc();
    // Al abrir, mostrar la imagen en pantalla (en el celular quedaba más abajo)
    setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready, W, H]);

  // ---------- Combinar: base automática + borrador manual ----------
  const compose = useCallback((rect?: { x: number; y: number; w: number; h: number }) => {
    const o = original.current;
    const b = base.current;
    const m = manual.current;
    const r = restore.current;
    if (!o || !b || !m || !r || !preview.current) return;
    if (!final.current || final.current.width !== o.width) final.current = new ImageData(o.width, o.height);
    const f = final.current.data;
    const x0 = rect ? Math.max(0, Math.floor(rect.x)) : 0;
    const y0 = rect ? Math.max(0, Math.floor(rect.y)) : 0;
    const x1 = rect ? Math.min(o.width, Math.ceil(rect.x + rect.w)) : o.width;
    const y1 = rect ? Math.min(o.height, Math.ceil(rect.y + rect.h)) : o.height;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = y * o.width + x;
        const i = p * 4;
        const src = r[p] ? o.data : b.data;
        f[i] = src[i];
        f[i + 1] = src[i + 1];
        f[i + 2] = src[i + 2];
        f[i + 3] = (src[i + 3] * m[p]) / 255;
      }
    }
    const ctx = preview.current.getContext("2d")!;
    if (preview.current.width !== o.width) {
      preview.current.width = o.width;
      preview.current.height = o.height;
    }
    if (rect) ctx.putImageData(final.current, 0, 0, x0, y0, x1 - x0, y1 - y0);
    else ctx.putImageData(final.current, 0, 0);
  }, []);

  // Recalcular la base cuando cambian las opciones automáticas
  useEffect(() => {
    if (!ready || !original.current) return;
    const t = setTimeout(() => {
      const o = original.current!;
      base.current = mode === "ia" ? aiResult || o : removeByColor(o, opts);
      compose();
    }, 60);
    return () => clearTimeout(t);
  }, [ready, opts, mode, aiResult, compose]);

  // Ver original (mantener presionado)
  useEffect(() => {
    if (!ready || !preview.current || !original.current) return;
    if (view === "original") preview.current.getContext("2d")!.putImageData(original.current, 0, 0);
    else compose();
  }, [view, ready, compose]);

  // ---------- Historial del borrador ----------
  const snapshot = () => {
    if (!manual.current || !restore.current) return;
    history.current = [...history.current.slice(-(HISTORY - 1)), { m: manual.current.slice(), r: restore.current.slice() }];
    setTick((t) => t + 1);
  };
  const undo = () => {
    // Primero deshace retoques manuales; luego, toques de la varita
    const h = history.current.pop();
    if (h) {
      manual.current = h.m;
      restore.current = h.r;
      compose();
      setTick((t) => t + 1);
    } else if (opts.seeds.length) {
      setOpts((o) => ({ ...o, seeds: o.seeds.slice(0, -1) }));
    }
  };

  // ---------- Coordenadas ----------
  const toImg = (e: React.PointerEvent): Pt => {
    const r = preview.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const scale = () => W / (fitW * zoom || 1); // píxeles de imagen por píxel de pantalla

  // ---------- Pincel ----------
  const dab = (pt: Pt, erase: boolean) => {
    const m = manual.current!;
    const rs = restore.current!;
    const rad = (brush / 2) * scale();
    const hard = hardness / 100;
    const x0 = Math.max(0, Math.floor(pt.x - rad));
    const x1 = Math.min(W - 1, Math.ceil(pt.x + rad));
    const y0 = Math.max(0, Math.floor(pt.y - rad));
    const y1 = Math.min(H - 1, Math.ceil(pt.y + rad));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - pt.x, y - pt.y);
        if (d > rad) continue;
        const s = d <= rad * hard ? 1 : 1 - (d - rad * hard) / (rad * (1 - hard) || 1);
        const p = y * W + x;
        if (erase) m[p] = Math.min(m[p], Math.round(255 * (1 - s)));
        else {
          m[p] = Math.max(m[p], Math.round(255 * s));
          if (s > 0.4) rs[p] = 1;
        }
      }
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  const stroke = (a: Pt, b: Pt, erase: boolean) => {
    const rad = (brush / 2) * scale();
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, rad / 3)));
    let bx0 = Infinity,
      by0 = Infinity,
      bx1 = -Infinity,
      by1 = -Infinity;
    for (let i = 1; i <= steps; i++) {
      const r = dab({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }, erase);
      bx0 = Math.min(bx0, r.x);
      by0 = Math.min(by0, r.y);
      bx1 = Math.max(bx1, r.x + r.w);
      by1 = Math.max(by1, r.y + r.h);
    }
    compose({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 });
  };

  // ---------- Capa de ayuda (cursor del pincel y selección) ----------
  const drawOverlay = (cursor?: Pt, sel: Pt[] | null = selection, live = false) => {
    const ov = overlay.current;
    if (!ov) return;
    if (ov.width !== W) {
      ov.width = W;
      ov.height = H;
    }
    const ctx = ov.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    const lw = Math.max(1, 2 * scale());
    if (sel && sel.length > 1) {
      ctx.save();
      ctx.beginPath();
      sel.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (!live || tool === "rect") ctx.closePath();
      ctx.fillStyle = "rgba(229,36,59,0.18)";
      ctx.fill();
      ctx.setLineDash([8 * scale(), 6 * scale()]);
      ctx.lineWidth = lw;
      ctx.strokeStyle = "#e5243b";
      ctx.stroke();
      ctx.restore();
    }
    if (cursor && (tool === "erase" || tool === "restore")) {
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, (brush / 2) * scale(), 0, Math.PI * 2);
      ctx.lineWidth = lw;
      ctx.strokeStyle = tool === "erase" ? "#e5243b" : "#32c48d";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, (brush / 2) * scale(), 0, Math.PI * 2);
      ctx.lineWidth = lw / 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
  };
  useEffect(() => drawOverlay(undefined, selection), [selection, tool, zoom, fitW]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Eventos del puntero ----------
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready || view === "original" || tool === "pan") return;
    const pt = toImg(e);
    if (tool === "wand") {
      if (mode !== "color") return setError("La varita funciona en el modo «Logos y fondos de un color».");
      setOpts((o) => ({ ...o, seeds: [...o.seeds, pt] }));
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "erase" || tool === "restore") {
      snapshot();
      drawing.current.last = pt;
      stroke(pt, pt, tool === "erase");
    } else {
      drawing.current.start = pt;
      drawing.current.path = [pt];
      setSelection(null);
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready || tool === "pan") return;
    const pt = toImg(e);
    const d = drawing.current;
    if ((tool === "erase" || tool === "restore") && d.last) {
      stroke(d.last, pt, tool === "erase");
      d.last = pt;
    } else if (tool === "rect" && d.start) {
      const s = d.start;
      drawOverlay(undefined, [s, { x: pt.x, y: s.y }, pt, { x: s.x, y: pt.y }], true);
      return;
    } else if (tool === "lasso" && d.start) {
      d.path.push(pt);
      drawOverlay(undefined, d.path, true);
      return;
    }
    drawOverlay(pt);
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current;
    const pt = toImg(e);
    if (tool === "rect" && d.start) {
      const s = d.start;
      if (Math.abs(pt.x - s.x) > 3 && Math.abs(pt.y - s.y) > 3) setSelection([s, { x: pt.x, y: s.y }, pt, { x: s.x, y: pt.y }]);
    } else if (tool === "lasso" && d.start && d.path.length > 4) {
      setSelection([...d.path]);
    }
    drawing.current = { last: null, start: null, path: [] };
  };

  // Borrar el área seleccionada o quedarse solo con ella
  const applySelection = (keepInside: boolean) => {
    if (!selection || !manual.current) return;
    snapshot();
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.beginPath();
    selection.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = "#000";
    ctx.fill();
    const inside = ctx.getImageData(0, 0, W, H).data;
    const m = manual.current;
    for (let p = 0; p < W * H; p++) {
      const a = inside[p * 4 + 3] / 255; // bordes suavizados del trazado
      if (keepInside) m[p] = Math.min(m[p], Math.round(255 * a));
      else m[p] = Math.min(m[p], Math.round(255 * (1 - a)));
    }
    setSelection(null);
    compose();
  };

  const resetManual = () => {
    if (!manual.current) return;
    snapshot();
    manual.current.fill(255);
    restore.current!.fill(0);
    compose();
  };

  const runAI = async () => {
    if (!srcCanvas.current) return;
    setMode("ia");
    setError("");
    try {
      setAiResult(await removeWithAI(srcCanvas.current, setBusy));
    } catch (e) {
      setError((e as Error).message || "La IA no pudo procesar la imagen.");
      setMode("color");
    } finally {
      setBusy("");
    }
  };

  const apply = () => {
    compose();
    let img = final.current;
    if (!img) return;
    if (trim) img = trimTransparent(img);
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d")!.putImageData(img, 0, 0);
    onApply(c.toDataURL("image/png"), { w: img.width, h: img.height }, { trimmed: trim });
  };

  const tools: [Tool, string, string][] = [
    ["wand", "🪄", "Varita"],
    ["erase", "🧽", "Borrador"],
    ["restore", "♻️", "Restaurar"],
    ["rect", "▭", "Rectángulo"],
    ["lasso", "➰", "Lazo"],
    ["pan", "✋", "Mover"],
  ];
  const help: Record<Tool, string> = {
    wand: "Toca un color para borrarlo (y todo lo parecido que esté conectado).",
    erase: "Pasa el dedo o el mouse para borrar. Ajusta el tamaño y la suavidad abajo.",
    restore: "Pasa el dedo para recuperar partes que se borraron de más.",
    rect: "Arrastra para seleccionar un rectángulo y elige qué hacer con él.",
    lasso: "Dibuja alrededor del área a mano alzada y elige qué hacer con ella.",
    pan: "Con zoom, arrastra para moverte por la imagen.",
  };
  const canvasStyle: React.CSSProperties = {
    width: fitW * zoom,
    height: (fitW * zoom * H) / W,
    touchAction: tool === "pan" ? "auto" : "none",
    cursor: tool === "pan" ? "grab" : tool === "wand" ? "crosshair" : "none",
  };

  return (
    <div className="props bg-remover">
      <div className="card-head">
        <strong>✂️ Quitar fondo y borrar · {title}</strong>
        <button className="btn ghost small" onClick={onClose}>
          Cancelar
        </button>
      </div>

      <div className="seg">
        <button className={mode === "color" ? "active" : ""} onClick={() => setMode("color")} disabled={!!busy}>
          🎯 Logos y fondos de un color
        </button>
        <button className={mode === "ia" ? "active" : ""} onClick={aiResult ? () => setMode("ia") : runAI} disabled={!!busy || !ready}>
          🤖 Fotos con IA
        </button>
      </div>

      {/* Herramientas manuales */}
      <div className="erase-tools">
        {tools.map(([id, icon, label]) => (
          <button key={id} className={tool === id ? "active" : ""} onClick={() => (setTool(id), setSelection(null))} title={label}>
            <span>{icon}</span>
            {label}
          </button>
        ))}
        <button onClick={undo} disabled={!history.current.length && !opts.seeds.length} title="Deshacer">
          <span>↶</span>Deshacer
        </button>
      </div>
      <p className="hint" style={{ margin: "2px 0" }}>
        {help[tool]}
      </p>

      <div className="checker zoom-box" ref={boxRef} style={{ overflow: zoom > 1 ? "auto" : "hidden" }}>
        {!ready && !error && <span className="muted">Cargando imagen…</span>}
        <div className="canvas-stack" style={{ display: ready ? "block" : "none" }}>
          <canvas ref={preview} style={canvasStyle} />
          <canvas
            ref={overlay}
            className="overlay"
            style={canvasStyle}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => drawOverlay(undefined)}
          />
        </div>
      </div>

      {selection && (
        <div className="actions sel-actions">
          <button className="btn small" onClick={() => applySelection(false)}>
            🗑️ Borrar área
          </button>
          <button className="btn small" onClick={() => applySelection(true)}>
            ✂️ Conservar solo el área
          </button>
          <button className="btn ghost small" onClick={() => setSelection(null)}>
            Cancelar selección
          </button>
        </div>
      )}

      <div className="row">
        <div className="slider">
          <div className="slider-head">
            <span>🔍 Zoom</span>
            <span>{zoom}x</span>
          </div>
          <input type="range" min={1} max={6} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </div>
        {(tool === "erase" || tool === "restore") && (
          <>
            <div className="slider">
              <div className="slider-head">
                <span>Tamaño del pincel</span>
                <span>{brush}</span>
              </div>
              <input type="range" min={2} max={160} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
            </div>
            <div className="slider">
              <div className="slider-head">
                <span>Dureza (bordes del pincel)</span>
                <span>{hardness}</span>
              </div>
              <input type="range" min={0} max={100} value={hardness} onChange={(e) => setHardness(Number(e.target.value))} />
            </div>
          </>
        )}
      </div>

      <div className="actions" style={{ justifyContent: "center" }}>
        <button
          className="btn ghost small"
          onPointerDown={() => setView("original")}
          onPointerUp={() => setView("result")}
          onPointerLeave={() => setView("result")}
        >
          👁️ Mantén para ver el original
        </button>
        <button className="btn ghost small" onClick={resetManual} disabled={!ready}>
          Quitar retoques manuales
        </button>
      </div>

      {busy && <div className="notice">{busy}</div>}
      {error && <div className="error">{error}</div>}

      {mode === "color" ? (
        <details className="more" open={!startWithEraser}>
          <summary>Opciones de quitar fondo por color</summary>
          <label className="check">
            <input type="checkbox" checked={opts.auto} onChange={(e) => setOpts({ ...opts, auto: e.target.checked })} />
            Quitar automáticamente el fondo del borde
          </label>
          <label className="check">
            <input type="checkbox" checked={opts.global} onChange={(e) => setOpts({ ...opts, global: e.target.checked })} />
            Quitar ese color en toda la imagen (también dentro de letras y huecos)
          </label>
          <div className="slider">
            <div className="slider-head">
              <span>Tolerancia (qué tan parecido debe ser el color)</span>
              <span>{opts.tolerance}</span>
            </div>
            <input type="range" min={1} max={100} value={opts.tolerance} onChange={(e) => setOpts({ ...opts, tolerance: Number(e.target.value) })} />
          </div>
          <div className="slider">
            <div className="slider-head">
              <span>Suavizado de bordes</span>
              <span>{opts.softness}</span>
            </div>
            <input type="range" min={0} max={100} value={opts.softness} onChange={(e) => setOpts({ ...opts, softness: Number(e.target.value) })} />
          </div>
          <button className="btn ghost small" onClick={() => setOpts({ auto: true, seeds: [], global: false, tolerance: 25, softness: 30 })}>
            Restablecer opciones
          </button>
        </details>
      ) : (
        <p className="hint" style={{ margin: "4px 0" }}>
          La IA detecta a la persona, el producto o el platillo y quita todo lo demás. Funciona dentro de tu navegador, gratis. La
          primera vez descarga el modelo (~115 MB, mejor con WiFi); después queda guardado. Luego puedes retocar con el borrador.
        </p>
      )}

      <label className="check">
        <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
        Recortar al tamaño del objeto (quita el espacio vacío alrededor)
      </label>
      <div className="actions">
        <button className="btn" onClick={apply} disabled={!ready || !!busy || (mode === "ia" && !aiResult)}>
          ✓ Aplicar
        </button>
      </div>
    </div>
  );
}
