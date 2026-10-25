"use client";

import { useEffect, useRef, useState } from "react";
import { ColorRemoval, hasTransparency, removeByColor, removeWithAI, trimTransparent } from "@/lib/bg-remove";

const MAX = 2048;

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

export default function BgRemover({
  src,
  title,
  onApply,
  onClose,
}: {
  src: string;
  title: string;
  onApply: (pngDataUrl: string, size: { w: number; h: number }) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"color" | "ia">("color");
  const [opts, setOpts] = useState<ColorRemoval>({ auto: true, seeds: [], global: false, tolerance: 25, softness: 30 });
  const [trim, setTrim] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [ready, setReady] = useState(false);
  const [aiResult, setAiResult] = useState<ImageData | null>(null);
  const [view, setView] = useState<"result" | "original">("result");

  const srcCanvas = useRef<HTMLCanvasElement | null>(null);
  const original = useRef<ImageData | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const current = useRef<ImageData | null>(null);

  // Cargar la imagen
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
        if (hasTransparency(original.current)) setOpts((o) => ({ ...o, auto: false }));
        setReady(true);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [src]);

  // Recalcular la vista previa
  useEffect(() => {
    if (!ready || !original.current || !preview.current) return;
    const t = setTimeout(() => {
      const o = original.current!;
      let result: ImageData;
      if (view === "original") result = o;
      else if (mode === "ia") result = aiResult || o;
      else result = removeByColor(o, opts);
      if (view !== "original") current.current = result;
      const cv = preview.current!;
      cv.width = result.width;
      cv.height = result.height;
      cv.getContext("2d")!.putImageData(result, 0, 0);
    }, 60);
    return () => clearTimeout(t);
  }, [ready, opts, mode, aiResult, view]);

  // Tocar la imagen: borra ese color (y lo conectado a él)
  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== "color" || view === "original") return;
    const cv = e.currentTarget;
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * cv.width;
    const y = ((e.clientY - r.top) / r.height) * cv.height;
    setOpts((o) => ({ ...o, seeds: [...o.seeds, { x, y }] }));
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
    let img = current.current;
    if (!img) return;
    if (trim) img = trimTransparent(img);
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d")!.putImageData(img, 0, 0);
    onApply(c.toDataURL("image/png"), { w: img.width, h: img.height });
  };

  return (
    <div className="props bg-remover">
      <div className="card-head">
        <strong>✂️ Quitar fondo · {title}</strong>
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

      <div className="checker">
        {!ready && !error && <span className="muted">Cargando imagen…</span>}
        <canvas
          ref={preview}
          onPointerDown={onTap}
          style={{ display: ready ? "block" : "none", cursor: mode === "color" ? "crosshair" : "default" }}
        />
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
      </div>

      {busy && <div className="notice">{busy}</div>}
      {error && <div className="error">{error}</div>}

      {mode === "color" ? (
        <>
          <p className="hint" style={{ margin: "4px 0" }}>
            {opts.auto
              ? "Se quitó el color del borde. Toca en la imagen cualquier parte que aún quieras borrar (por ejemplo, el fondo dentro de una letra «O»)."
              : "Toca en la imagen el color de fondo que quieres borrar."}
          </p>
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
          <div className="actions">
            <button className="btn ghost small" disabled={!opts.seeds.length} onClick={() => setOpts({ ...opts, seeds: opts.seeds.slice(0, -1) })}>
              ↶ Deshacer toque
            </button>
            <button className="btn ghost small" onClick={() => setOpts({ auto: true, seeds: [], global: false, tolerance: 25, softness: 30 })}>
              Restablecer
            </button>
          </div>
        </>
      ) : (
        <p className="hint" style={{ margin: "4px 0" }}>
          La IA detecta a la persona, el producto o el platillo y quita todo lo demás. Funciona dentro de tu navegador, gratis. La
          primera vez descarga el modelo (~115 MB, mejor con WiFi); después queda guardado. En celulares puede tardar más.
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
