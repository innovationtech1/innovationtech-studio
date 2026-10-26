"use client";

import { useEffect, useRef, useState } from "react";
import { ShapeId, shapePath, SHAPES } from "@/lib/shapes";

import { Check, Dices, Shapes, Sparkles } from "lucide-react";
type Bg = "none" | "color" | "gradient";
type Style = {
  outline: number; // grosor del borde (0 = sin borde), % del lado
  outlineColor: string;
  shadow: number; // 0..100
  shadowColor: string;
  glow: boolean; // neón
  offset: number; // marco desplazado (0 = no), % del lado
  offsetColor: string;
  bg: Bg;
  bg1: string;
  bg2: string;
  bgAngle: number;
  padding: number; // espacio alrededor (% del lado) cuando hay fondo
};

const STYLE_PRESETS: { name: string; s: Partial<Style> }[] = [
  { name: "Limpio", s: { outline: 0, shadow: 0, glow: false, offset: 0, bg: "none" } },
  { name: "Sticker", s: { outline: 3, outlineColor: "#ffffff", shadow: 35, shadowColor: "#000000", glow: false, offset: 0, bg: "none" } },
  { name: "Sombra suave", s: { outline: 0, shadow: 55, shadowColor: "#000000", glow: false, offset: 0, bg: "none" } },
  { name: "Marco de marca", s: { outline: 2.2, outlineColor: "#e5243b", shadow: 0, glow: false, offset: 0, bg: "none" } },
  { name: "Desplazado", s: { outline: 0, shadow: 0, glow: false, offset: 5, offsetColor: "#e5243b", bg: "none" } },
  { name: "Neón", s: { outline: 1, outlineColor: "#5ee7ff", shadow: 70, shadowColor: "#00c8ff", glow: true, offset: 0, bg: "color", bg1: "#070d1f", padding: 10 } },
  { name: "Tarjeta degradada", s: { outline: 0, shadow: 40, shadowColor: "#000000", glow: false, offset: 0, bg: "gradient", bg1: "#e5243b", bg2: "#0d1630", bgAngle: 135, padding: 10 } },
  { name: "Pastel", s: { outline: 2.5, outlineColor: "#ffffff", shadow: 20, shadowColor: "#8e44ad", glow: false, offset: 0, bg: "gradient", bg1: "#ffd6e8", bg2: "#d6e6ff", bgAngle: 45, padding: 12 } },
];

const RATIOS: { id: string; label: string; r: number }[] = [
  { id: "auto", label: "Natural", r: 0 },
  { id: "1:1", label: "1:1", r: 1 },
  { id: "4:5", label: "4:5", r: 1.25 },
  { id: "9:16", label: "9:16", r: 16 / 9 },
  { id: "16:9", label: "16:9", r: 9 / 16 },
  { id: "3:4", label: "3:4", r: 4 / 3 },
];

const SWATCHES = ["#ffffff", "#000000", "#0d1630", "#e5243b", "#ffd23f", "#32c48d", "#2f80ed", "#ff7a00", "#8e44ad", "#ffd6e8"];
const OUT = 1080; // tamaño de la figura en la imagen final

async function loadImage(src: string): Promise<HTMLImageElement> {
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

function ShapeIcon({ id, active, onClick, label }: { id: ShapeId; active: boolean; onClick: () => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const s = 40;
    c.width = s * 2;
    c.height = s * 2;
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, s, s);
    const info = SHAPES.find((x) => x.id === id);
    const r = info?.ratio || 1;
    const h = r >= 1 ? s - 6 : (s - 6) * r;
    const w = r >= 1 ? (s - 6) / r : s - 6;
    ctx.translate((s - w) / 2, (s - h) / 2);
    ctx.fillStyle = active ? "#ffffff" : "#9aa5c4";
    ctx.fill(shapePath(id, w, h, { radius: 22, points: 6, seed: 3 }));
  }, [id, active]);
  return (
    <button className={`shape-btn ${active ? "active" : ""}`} onClick={onClick} title={label}>
      <canvas ref={ref} style={{ width: 40, height: 40 }} />
      <span>{label}</span>
    </button>
  );
}

export default function ShapeCrop({
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
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  const [shape, setShape] = useState<ShapeId>("circle");
  const [ratio, setRatio] = useState("auto");
  const [radius, setRadius] = useState(22);
  const [points, setPoints] = useState(5);
  const [seed, setSeed] = useState(3);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // en fracción de la caja
  const [style, setStyle] = useState<Style>({
    outline: 0,
    outlineColor: "#ffffff",
    shadow: 0,
    shadowColor: "#000000",
    glow: false,
    offset: 0,
    offsetColor: "#e5243b",
    bg: "none",
    bg1: "#e5243b",
    bg2: "#0d1630",
    bgAngle: 135,
    padding: 10,
  });
  const [panel, setPanel] = useState<"forma" | "estilo">("forma");
  const preview = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    loadImage(src)
      .then(setImg)
      .catch((e) => setError(e.message));
  }, [src]);

  const shapeRatio = () => {
    const r = RATIOS.find((x) => x.id === ratio)!.r;
    if (r) return r;
    return SHAPES.find((s) => s.id === shape)?.ratio || 1;
  };

  // Dibuja el resultado en un lienzo del tamaño indicado
  const render = (canvas: HTMLCanvasElement, boxLong: number) => {
    if (!img) return { w: 0, h: 0 };
    const r = shapeRatio(); // alto / ancho
    const bw = r >= 1 ? boxLong / r : boxLong;
    const bh = r >= 1 ? boxLong : boxLong * r;
    const u = Math.min(bw, bh) / 100; // 1% del lado corto
    const hasBg = style.bg !== "none";
    const outline = style.outline * u;
    const offset = style.offset * u;
    const shadowBlur = (style.shadow / 100) * 12 * u * (style.glow ? 1.6 : 1);
    const margin = hasBg ? style.padding * u + outline : outline + shadowBlur * 1.6 + offset + 2;
    const W = Math.ceil(bw + margin * 2 + offset);
    const H = Math.ceil(bh + margin * 2 + offset);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);

    if (style.bg === "color") {
      ctx.fillStyle = style.bg1;
      ctx.fillRect(0, 0, W, H);
    } else if (style.bg === "gradient") {
      const a = (style.bgAngle * Math.PI) / 180;
      const cx = W / 2;
      const cy = H / 2;
      const L = Math.abs(W * Math.cos(a)) / 2 + Math.abs(H * Math.sin(a)) / 2;
      const g = ctx.createLinearGradient(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
      g.addColorStop(0, style.bg1);
      g.addColorStop(1, style.bg2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    const path = shapePath(shape, bw, bh, { radius, points, seed });
    ctx.save();
    ctx.translate(margin, margin);
    ctx.lineJoin = "round";

    // Marco desplazado (detrás)
    if (offset > 0) {
      ctx.save();
      ctx.translate(offset, offset);
      ctx.fillStyle = style.offsetColor;
      ctx.fill(path);
      ctx.restore();
    }
    // Sombra / brillo neón + borde exterior
    if (shadowBlur > 0 || outline > 0) {
      ctx.save();
      if (shadowBlur > 0) {
        ctx.shadowColor = style.shadowColor;
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetY = style.glow ? 0 : shadowBlur * 0.35;
      }
      ctx.fillStyle = outline > 0 ? style.outlineColor : "#000";
      if (outline > 0) {
        ctx.strokeStyle = style.outlineColor;
        ctx.lineWidth = outline * 2;
        ctx.stroke(path);
      }
      ctx.fill(path);
      ctx.restore();
    }
    // La foto dentro de la figura
    ctx.save();
    ctx.clip(path);
    const cover = Math.max(bw / img.naturalWidth, bh / img.naturalHeight) * zoom;
    ctx.translate(bw / 2 + pan.x * bw, bh / 2 + pan.y * bh);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, (-img.naturalWidth * cover) / 2, (-img.naturalHeight * cover) / 2, img.naturalWidth * cover, img.naturalHeight * cover);
    ctx.restore();
    // Neón: línea brillante encima
    if (style.glow && outline > 0) {
      ctx.save();
      ctx.shadowColor = style.shadowColor;
      ctx.shadowBlur = shadowBlur * 0.6;
      ctx.strokeStyle = style.outlineColor;
      ctx.lineWidth = Math.max(1, outline);
      ctx.stroke(path);
      ctx.restore();
    }
    ctx.restore();
    return { w: W, h: H };
  };

  useEffect(() => {
    if (!img || !preview.current) return;
    render(preview.current, 720);
  }); // se redibuja con cada cambio

  // Mover la foto con el dedo / mouse y pellizcar para zoom
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(Math.max(1, Math.min(5, (gesture.current.zoom * d) / gesture.current.dist)));
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setPan((p) => ({ x: p.x + (cur.x - prev.x) / rect.width, y: p.y + (cur.y - prev.y) / rect.height }));
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  };

  const apply = () => {
    const c = document.createElement("canvas");
    const size = render(c, OUT);
    onApply(c.toDataURL("image/png"), size);
  };

  const set = (p: Partial<Style>) => setStyle((s) => ({ ...s, ...p }));
  const usesRadius = shape === "rounded";
  const usesPoints = shape === "star" || shape === "flower" || shape === "scallop";

  return (
    <div className="props shape-crop">
      <div className="card-head">
        <strong>Recortar con forma · {title}</strong>
        <button className="btn ghost small" onClick={onClose}>
          Cancelar
        </button>
      </div>

      <div className="checker shape-preview">
        {!img && !error && <span className="muted">Cargando imagen…</span>}
        <canvas
          ref={preview}
          style={{ display: img ? "block" : "none", touchAction: "none", cursor: "grab" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={(e) => setZoom((z) => Math.max(1, Math.min(5, z - e.deltaY * 0.0015)))}
        />
      </div>
      <p className="hint" style={{ margin: "2px 0", textAlign: "center" }}>
        Arrastra la foto para acomodarla dentro de la figura · pellizca o usa el zoom para acercar
      </p>
      {error && <div className="error">{error}</div>}

      <div className="seg">
        <button className={panel === "forma" ? "active" : ""} onClick={() => setPanel("forma")}>
          <Shapes size={16} aria-hidden /> Forma
        </button>
        <button className={panel === "estilo" ? "active" : ""} onClick={() => setPanel("estilo")}>
          <Sparkles size={16} aria-hidden /> Estilo moderno
        </button>
      </div>

      {panel === "forma" ? (
        <>
          <div className="shape-grid">
            {SHAPES.map((s) => (
              <ShapeIcon key={s.id} id={s.id} label={s.label} active={shape === s.id} onClick={() => setShape(s.id)} />
            ))}
          </div>
          {shape === "blob" && (
            <button className="btn ghost small" onClick={() => setSeed((s) => s + 1)} style={{ alignSelf: "flex-start" }}>
              <Dices size={16} aria-hidden /> Otra forma orgánica
            </button>
          )}
          <label>Proporción</label>
          <div className="seg">
            {RATIOS.map((r) => (
              <button key={r.id} className={ratio === r.id ? "active" : ""} onClick={() => setRatio(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          {usesRadius && <Range label="Redondeo de esquinas" min={0} max={50} value={radius} onChange={setRadius} />}
          {usesPoints && <Range label={shape === "star" ? "Puntas" : "Pétalos / ondas"} min={4} max={12} value={points} onChange={setPoints} />}
          <Range label="Zoom de la foto" min={1} max={5} step={0.05} value={zoom} onChange={setZoom} />
          <Range label="⟳ Girar la foto" min={-180} max={180} value={rotation} onChange={setRotation} />
          <div className="actions">
            <button className="btn ghost small" onClick={() => (setPan({ x: 0, y: 0 }), setZoom(1), setRotation(0))}>
              Centrar foto
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="presets">
            {STYLE_PRESETS.map((p) => (
              <button key={p.name} onClick={() => set(p.s)}>
                {p.name}
              </button>
            ))}
          </div>
          <Range label="Borde" min={0} max={8} step={0.2} value={style.outline} onChange={(v) => set({ outline: v })} />
          {style.outline > 0 && <Colors value={style.outlineColor} onChange={(c) => set({ outlineColor: c })} />}
          <Range label="Sombra" min={0} max={100} value={style.shadow} onChange={(v) => set({ shadow: v })} />
          {style.shadow > 0 && (
            <>
              <Colors value={style.shadowColor} onChange={(c) => set({ shadowColor: c })} />
              <label className="check">
                <input type="checkbox" checked={style.glow} onChange={(e) => set({ glow: e.target.checked })} />
                Efecto neón (brillo alrededor)
              </label>
            </>
          )}
          <Range label="Marco desplazado" min={0} max={12} step={0.5} value={style.offset} onChange={(v) => set({ offset: v })} />
          {style.offset > 0 && <Colors value={style.offsetColor} onChange={(c) => set({ offsetColor: c })} />}
          <label>Fondo</label>
          <div className="seg">
            {(
              [
                ["none", "Transparente"],
                ["color", "Color"],
                ["gradient", "Degradado"],
              ] as [Bg, string][]
            ).map(([id, l]) => (
              <button key={id} className={style.bg === id ? "active" : ""} onClick={() => set({ bg: id })}>
                {l}
              </button>
            ))}
          </div>
          {style.bg !== "none" && (
            <>
              <Colors value={style.bg1} onChange={(c) => set({ bg1: c })} />
              {style.bg === "gradient" && (
                <>
                  <Colors value={style.bg2} onChange={(c) => set({ bg2: c })} />
                  <Range label="Ángulo del degradado" min={0} max={360} value={style.bgAngle} onChange={(v) => set({ bgAngle: v })} />
                </>
              )}
              <Range label="Espacio alrededor" min={0} max={30} value={style.padding} onChange={(v) => set({ padding: v })} />
            </>
          )}
        </>
      )}

      <div className="actions">
        <button className="btn" onClick={apply} disabled={!img}>
          <Check size={16} aria-hidden /> Aplicar recorte
        </button>
      </div>
    </div>
  );
}

function Range({ label, min, max, step = 1, value, onChange }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="slider">
      <div className="slider-head">
        <span>{label}</span>
        <span>{Math.round(value * 10) / 10}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Colors({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {SWATCHES.map((c) => (
        <button key={c} className={value.toLowerCase() === c ? "active" : ""} style={{ background: c }} onClick={() => onChange(c)} aria-label={`Color ${c}`} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Otro color" />
    </div>
  );
}
