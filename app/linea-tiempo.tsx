"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Camera, Copy, Dices, Plus, RefreshCw, Scissors, Sparkles, Trash2, Undo2 } from "lucide-react";
import { MOVIMIENTOS, movimientoAlAzar } from "@/lib/movimientos";
import { MAX_FOTO, MAX_TOMAS, MIN_FOTO, MIN_TRAMO, VELOCIDADES, duracionClip, presente, tramo, type Clip, type Reproduccion, type TextoPos, type TextoTam } from "@/lib/linea-tiempo";
import { cuadroDe } from "@/lib/video-propio";

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
  videoDe,
  onRecortar,
  onDividir,
  onCongelar,
  panelVideo,
  estadoToma,
  onAnimar,
  onRehacer,
  onVolver,
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
  videoDe: (archivoId: string) => string | null | undefined; // enlace local del video; null = falta el archivo; undefined = abriéndose
  onRecortar: (i: number, inicio: number, fin: number) => void;
  onDividir: (i: number, segundo: number) => void;
  onCongelar: (i: number, cuadro: string) => void; // cuadro: JPG del momento elegido
  panelVideo: (i: number) => ReactNode; // de dónde sale el video: grabar, subir, galería, quitar
  estadoToma: (clipId: string) => { texto: string; ocupada: boolean }; // qué pasa con la toma con IA de ese clip
  onAnimar: (i: number) => void; // genera la toma de ese clip (1 toma)
  onRehacer: (i: number) => void; // pide otra versión con el mismo movimiento (1 toma)
  onVolver: (i: number) => void; // vuelve a la toma anterior (no cuesta)
}) {
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [encima, setEncima] = useState<number | null>(null);
  const clip = elegido >= 0 && elegido < clips.length ? clips[elegido] : null;
  const esToma = clip?.tipo === "toma";
  const esVideo = clip?.tipo === "video";

  return (
    <div className="lt">
      <div className="lt-fila" role="list" aria-label="Clips del video">
        {clips.map((c, i) => {
          const tipo = c.tipo === "toma" ? "IA" : c.tipo === "video" ? "Video" : "Foto";
          const dura = presente(c) ? segundosTexto(duracionClip(c)) : "vacío";
          return (
            <div role="listitem" key={c.id}>
              <button
                type="button"
                className={`lt-clip${i === elegido ? " elegido" : ""}${encima === i && arrastrando !== null && arrastrando !== i ? " encima" : ""}`}
                aria-label={`Clip ${i + 1} de ${clips.length} · ${c.tipo === "toma" ? "con IA" : c.tipo === "video" ? "video" : "foto"} · ${dura}`}
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
                  <span data-no-translate>{presente(c) ? segundosTexto(duracionClip(c)) : "—"}</span>
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
            <div className="lt-panel-foto">{esVideo ? panelVideo(elegido) : panelImagen(elegido)}</div>
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

              {esVideo && clip && (
                <PanelVideo
                  key={clip.id}
                  clip={clip}
                  src={clip.archivoId ? videoDe(clip.archivoId) : null}
                  ocupado={ocupado}
                  onRecortar={(ini, f) => onRecortar(elegido, ini, f)}
                  onDividir={(seg) => onDividir(elegido, seg)}
                  onCongelar={(cuadro) => onCongelar(elegido, cuadro)}
                  onCambiar={(cambios) => onCambiar(elegido, cambios)}
                />
              )}

              {!esVideo && (
                <>
                {esToma ? (
                    <div>
                      <label htmlFor="lt-estirar">Duración de la foto animada</label>
                      <select id="lt-estirar" value={clip.reproduccion ?? "normal"} disabled={ocupado} onChange={(e) => onCambiar(elegido, { reproduccion: e.target.value as Reproduccion })}>
                        <option value="normal">Normal · 5 s</option>
                        <option value="lenta">Cámara lenta · 10 s</option>
                        <option value="repetir2">Repetir 2 veces · 10 s</option>
                        <option value="repetir3">Repetir 3 veces · 15 s</option>
                      </select>
                    </div>
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
                    {!esToma && tomasMarcadas >= MAX_TOMAS && <p className="hint" style={{ margin: 0 }}>Ya llegaste al máximo de 8 fotos con IA en este video.</p>}
                    {esToma && (
                      <div className="lt-mov">
                        <label htmlFor="lt-mov">¿Cómo se mueve? Toca una opción o escribe la tuya</label>
                        <div className="lt-mov-opciones">
                          <button
                            type="button"
                            className="btn small"
                            disabled={ocupado}
                            onClick={() => onCambiar(elegido, { movimiento: movimientoAlAzar(clip.movimiento ?? "") })}
                          >
                            <Dices size={15} aria-hidden /> Sorpréndeme
                          </button>
                          {MOVIMIENTOS.map((m) => (
                            <button
                              type="button"
                              key={m.id}
                              className={`btn ghost small${(clip.movimiento ?? "") === m.texto ? " activo" : ""}`}
                              aria-pressed={(clip.movimiento ?? "") === m.texto}
                              disabled={ocupado}
                              onClick={() => onCambiar(elegido, { movimiento: m.texto })}
                            >
                              {m.nombre}
                            </button>
                          ))}
                        </div>
                        <textarea
                          id="lt-mov"
                          value={clip.movimiento ?? ""}
                          maxLength={300}
                          rows={2}
                          onChange={(e) => onCambiar(elegido, { movimiento: e.target.value })}
                          placeholder="Movimiento (opcional). Ej.: la cámara se acerca despacio"
                        />
                        <div className="actions lt-video-botones">
                          {!clip.trabajoId ? (
                            <button type="button" className="btn small" disabled={ocupado || estadoToma(clip.id).ocupada} onClick={() => onAnimar(elegido)}>
                              <Sparkles size={15} aria-hidden /> Animar esta foto ahora (1 toma)
                            </button>
                          ) : (
                            <>
                              <button type="button" className="btn ghost small" disabled={ocupado || estadoToma(clip.id).ocupada} onClick={() => onRehacer(elegido)}>
                                <RefreshCw size={15} aria-hidden /> Rehacer (1 toma)
                              </button>
                              {clip.anteriorTrabajoId && (
                                <button type="button" className="btn ghost small" disabled={ocupado || estadoToma(clip.id).ocupada} onClick={() => onVolver(elegido)}>
                                  <Undo2 size={15} aria-hidden /> Volver a la anterior
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        {estadoToma(clip.id).texto ? (
                          <p className="notice" style={{ margin: 0 }}>{estadoToma(clip.id).texto}</p>
                        ) : (
                          clip.trabajoId && <p className="hint" style={{ margin: 0 }}>Esta foto ya está animada. Mira el resultado en la vista previa.</p>
                        )}
                        <p className="hint" style={{ margin: 0 }}>
                          Cambiar la foto o el movimiento descarta la animación y hay que hacerla de nuevo.
                        </p>
                      </div>
                    )}
                  </>
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

// El panel de un clip de video propio: verlo, recortarlo, dividirlo, cambiarle la velocidad y el sonido.
function PanelVideo({
  clip,
  src,
  ocupado,
  onRecortar,
  onDividir,
  onCongelar,
  onCambiar,
}: {
  clip: Clip;
  src: string | null | undefined;
  ocupado: boolean;
  onRecortar: (inicio: number, fin: number) => void;
  onDividir: (segundo: number) => void;
  onCongelar: (cuadro: string) => void;
  onCambiar: (cambios: Partial<Clip>) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const t = tramo(clip);
  const dur = clip.duracionOriginal ?? 0;
  const [pos, setPos] = useState(t.inicio);
  // El reproductor se queda dentro del recorte: al cambiar el inicio o el fin, salta ahí
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (v.currentTime < t.inicio || v.currentTime > t.fin) v.currentTime = t.inicio;
  }, [t.inicio, t.fin]);
  const alAvanzar = () => {
    const v = video.current;
    if (!v) return;
    if (v.currentTime >= t.fin && !v.paused) {
      v.pause();
      v.currentTime = t.inicio;
    }
    setPos(v.currentTime);
  };
  const sePuedeDividir = pos - t.inicio >= MIN_TRAMO && t.fin - pos >= MIN_TRAMO;
  const s1 = (n: number) => `${Number(n.toFixed(1))} s`;

  if (src === null) return <div className="error" style={{ margin: 0 }}>Falta el archivo de este video en este dispositivo. Usa los botones de la izquierda para poner otro.</div>;

  return (
    <div className="lt-video">
      {src ? (
        <video ref={video} src={src} controls playsInline preload="metadata" onTimeUpdate={alAvanzar} onSeeked={alAvanzar} onLoadedMetadata={() => video.current && (video.current.currentTime = t.inicio)} />
      ) : (
        <p className="muted">Abriendo el video…</p>
      )}
      <div className="slider">
        <div className="slider-head">
          <span>Empieza en</span>
          <span data-no-translate>{s1(t.inicio)}</span>
        </div>
        <input type="range" aria-label="Empieza en" min={0} max={dur} step={0.1} value={t.inicio} disabled={ocupado} onChange={(e) => onRecortar(Math.min(Number(e.target.value), t.fin - MIN_TRAMO), t.fin)} />
      </div>
      <div className="slider">
        <div className="slider-head">
          <span>Termina en</span>
          <span data-no-translate>{s1(t.fin)}</span>
        </div>
        <input type="range" aria-label="Termina en" min={0} max={dur} step={0.1} value={t.fin} disabled={ocupado} onChange={(e) => onRecortar(t.inicio, Math.max(Number(e.target.value), t.inicio + MIN_TRAMO))} />
      </div>
      <p className="hint" style={{ margin: 0 }}>{`En tu video dura ${s1(duracionClip(clip))} (el original dura ${s1(dur)}).`}</p>
      <div className="actions lt-video-botones">
        <button type="button" className="btn ghost small" disabled={ocupado || !src || !sePuedeDividir} onClick={() => onDividir(pos)}>
          <Scissors size={15} aria-hidden /> Dividir aquí
        </button>
        <button type="button" className="btn ghost small" disabled={ocupado || !src} onClick={() => video.current && video.current.videoWidth > 0 && onCongelar(cuadroDe(video.current, 1280))}>
          <Camera size={15} aria-hidden /> Congelar este cuadro
        </button>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Mueve el video al momento que quieras y toca «Dividir aquí» para partirlo en dos, o «Congelar este cuadro» para sacar una foto.
      </p>
      <div className="row">
        <div>
          <label htmlFor="lt-vel">Velocidad</label>
          <select id="lt-vel" value={clip.velocidad ?? 1} disabled={ocupado} onChange={(e) => onCambiar({ velocidad: Number(e.target.value) })}>
            {VELOCIDADES.map((v) => (
              <option key={v} value={v}>
                {v === 1 ? "Normal" : v < 1 ? `Lenta ×${v}` : `Rápida ×${v}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="check" style={{ margin: 0 }}>
        <input type="checkbox" checked={!clip.sinSonido} disabled={ocupado} onChange={(e) => onCambiar({ sinSonido: !e.target.checked })} />
        Sonido de este video
      </label>
      {(clip.velocidad ?? 1) !== 1 && !clip.sinSonido && (
        <p className="hint" style={{ margin: 0 }}>
          A otra velocidad el sonido se oye distinto.
        </p>
      )}
    </div>
  );
}
