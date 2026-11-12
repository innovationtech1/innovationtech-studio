"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Copy, Plus, Trash2 } from "lucide-react";
import { MAX_FOTO, MAX_TOMAS, MIN_FOTO, duracionClip, type Clip, type TextoPos, type TextoTam } from "@/lib/linea-tiempo";

// Segundos con un decimal como mucho: 3 → «3 s», 5.125 → «5.1 s»
const segundosTexto = (n: number) => `${Number(n.toFixed(1))} s`;

// La fila de clips del video (línea de tiempo) y el panel del clip elegido.
// Mover: con los botones ← → en cualquier dispositivo, o arrastrando con el ratón.
export default function LineaTiempo({
  clips,
  elegido,
  onElegir,
  onMover,
  onDuplicar,
  onBorrar,
  onCambiar,
  onAgregar,
  conIa,
  tomasMarcadas,
  ocupado,
  panelImagen,
}: {
  clips: Clip[];
  elegido: number; // índice del clip abierto (−1 = ninguno)
  onElegir: (i: number) => void;
  onMover: (de: number, a: number) => void;
  onDuplicar: (i: number) => void;
  onBorrar: (i: number) => void;
  onCambiar: (i: number, cambios: Partial<Clip>) => void;
  onAgregar: () => void;
  conIa: boolean; // hay cuenta con sesión: se puede animar con IA
  tomasMarcadas: number;
  ocupado: boolean;
  panelImagen: (i: number) => ReactNode; // foto del clip y sus botones (subir, galería, crear, editar, quitar)
}) {
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [encima, setEncima] = useState<number | null>(null);
  const clip = elegido >= 0 && elegido < clips.length ? clips[elegido] : null;
  const esToma = clip?.tipo === "toma";

  return (
    <div className="lt">
      <div className="lt-fila" role="list" aria-label="Clips del video">
        {clips.map((c, i) => {
          const tipo = c.tipo === "toma" ? "IA" : "Foto";
          const dura = c.image ? segundosTexto(duracionClip(c)) : "vacío";
          return (
            <div role="listitem" key={c.id}>
              <button
                type="button"
                className={`lt-clip${i === elegido ? " elegido" : ""}${encima === i && arrastrando !== null && arrastrando !== i ? " encima" : ""}`}
                aria-label={`Clip ${i + 1} de ${clips.length} · ${c.tipo === "toma" ? "con IA" : "foto"} · ${dura}`}
                aria-pressed={i === elegido}
                draggable={!ocupado}
                onDragStart={(e) => {
                  setArrastrando(i);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(i));
                }}
                onDragOver={(e) => {
                  if (arrastrando === null) return;
                  e.preventDefault();
                  setEncima(i);
                }}
                onDragEnd={() => (setArrastrando(null), setEncima(null))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (arrastrando !== null && arrastrando !== i) onMover(arrastrando, i);
                  setArrastrando(null);
                  setEncima(null);
                }}
                onClick={() => onElegir(i === elegido ? -1 : i)}
              >
                <span className="lt-mini">
                  {c.loading ? <span className="muted">…</span> : c.image ? <img src={c.image} alt="" draggable={false} /> : <Plus size={20} aria-hidden />}
                </span>
                <span className="lt-pie">
                  <span className={c.tipo === "toma" ? "lt-tipo ia" : "lt-tipo"}>{tipo}</span>
                  <span data-no-translate>{c.image ? segundosTexto(duracionClip(c)) : "—"}</span>
                </span>
              </button>
            </div>
          );
        })}
        <div role="listitem">
          <button type="button" className="lt-clip lt-mas" disabled={ocupado} onClick={onAgregar}>
            <span className="lt-mini">
              <Plus size={22} aria-hidden />
            </span>
            <span className="lt-pie">Agregar</span>
          </button>
        </div>
      </div>

      {!clip && <p className="hint lt-ayuda">Toca un clip para ponerle foto, texto y duración.</p>}

      {clip && (
        <div className="lt-panel">
          <div className="lt-panel-cab">
            <strong>{`Clip ${elegido + 1} de ${clips.length}`}</strong>
            <div className="actions">
              <button type="button" className="btn ghost small" disabled={ocupado || elegido === 0} onClick={() => onMover(elegido, elegido - 1)} aria-label="Mover antes">
                <ArrowLeft size={16} aria-hidden /> Antes
              </button>
              <button
                type="button"
                className="btn ghost small"
                disabled={ocupado || elegido === clips.length - 1}
                onClick={() => onMover(elegido, elegido + 1)}
                aria-label="Mover después"
              >
                Después <ArrowRight size={16} aria-hidden />
              </button>
              <button type="button" className="btn ghost small" disabled={ocupado} onClick={() => onDuplicar(elegido)}>
                <Copy size={15} aria-hidden /> Duplicar
              </button>
              <button type="button" className="btn ghost small" disabled={ocupado} onClick={() => onBorrar(elegido)}>
                <Trash2 size={15} aria-hidden /> Borrar
              </button>
            </div>
          </div>

          <div className="lt-panel-cuerpo">
            <div className="lt-panel-foto">{panelImagen(elegido)}</div>
            <div className="lt-panel-datos">
              <label htmlFor="lt-texto">Texto en pantalla</label>
              <input
                id="lt-texto"
                value={clip.caption}
                onChange={(e) => onCambiar(elegido, { caption: e.target.value })}
                placeholder="Lo que se lee sobre la imagen (opcional)"
              />
              <div className="row">
                <div>
                  <label htmlFor="lt-pos">Posición del texto</label>
                  <select id="lt-pos" value={clip.textoPos ?? "abajo"} onChange={(e) => onCambiar(elegido, { textoPos: e.target.value as TextoPos })}>
                    <option value="arriba">Arriba</option>
                    <option value="centro">Centro</option>
                    <option value="abajo">Abajo</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="lt-tam">Tamaño del texto</label>
                  <select id="lt-tam" value={clip.textoTam ?? "normal"} onChange={(e) => onCambiar(elegido, { textoTam: e.target.value as TextoTam })}>
                    <option value="chico">Chico</option>
                    <option value="normal">Normal</option>
                    <option value="grande">Grande</option>
                  </select>
                </div>
              </div>

              {esToma ? (
                <p className="hint" style={{ margin: "4px 0 0" }}>
                  Las fotos animadas con IA duran 5 segundos.
                </p>
              ) : (
                <div className="slider">
                  <div className="slider-head">
                    <span>Duración de esta foto</span>
                    <span data-no-translate>{segundosTexto(clip.segundos)}</span>
                  </div>
                  <input
                    type="range"
                    aria-label="Duración de esta foto"
                    min={MIN_FOTO}
                    max={MAX_FOTO}
                    step={0.5}
                    value={clip.segundos}
                    onChange={(e) => onCambiar(elegido, { segundos: Number(e.target.value) })}
                  />
                </div>
              )}

              <label htmlFor="lt-prompt">Descripción para crear la imagen con IA</label>
              <textarea
                id="lt-prompt"
                value={clip.prompt}
                maxLength={400}
                rows={2}
                onChange={(e) => onCambiar(elegido, { prompt: e.target.value })}
                placeholder="Qué debe verse en la foto. Se usa al tocar «Crear con IA»."
              />

              {conIa && clip.image && (
                <>
                  <label className="check" style={{ margin: "4px 0 0" }}>
                    <input
                      type="checkbox"
                      checked={esToma}
                      disabled={ocupado || (!esToma && tomasMarcadas >= MAX_TOMAS)}
                      onChange={(e) => onCambiar(elegido, { tipo: e.target.checked ? "toma" : "foto" })}
                    />
                    Animar con IA (movimiento real, 5 s)
                  </label>
                  {!esToma && tomasMarcadas >= MAX_TOMAS && <p className="hint" style={{ margin: 0 }}>Ya marcaste el máximo de 4 fotos con IA en este video.</p>}
                  {esToma && (
                    <input
                      value={clip.movimiento ?? ""}
                      maxLength={300}
                      onChange={(e) => onCambiar(elegido, { movimiento: e.target.value })}
                      placeholder="Movimiento (opcional). Ej.: la cámara se acerca despacio"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
