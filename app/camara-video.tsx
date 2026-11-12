"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle, RotateCcw, Square, SwitchCamera, X } from "lucide-react";
import { MAX_GRABACION, formatoGrabacion, mensajeCamara, relojGrabacion } from "@/lib/camara";
import { usarCamara } from "./usar-camara";
import { CamaraNoAbre, SelectorCamara } from "./camara-ayuda";

// Cámara de video dentro de Studio: graba con imagen y sonido (hasta 60 s) sin salir de la app.
// Al terminar se puede repetir o usar; el video se entrega con onVideo.
export default function CamaraVideo({ onVideo, onCerrar }: { onVideo: (video: Blob) => void | Promise<void>; onCerrar: () => void }) {
  const grabadora = useRef<MediaRecorder | null>(null);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [hecho, setHecho] = useState<{ blob: Blob; url: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  // La cámara con micrófono; mientras se revisa lo grabado, descansa
  const cam = usarCamara({ sonido: true, ancho: 1280, alto: 720, pausada: !!hecho });
  const { video: vista, flujo, listo: lista, error, aviso, setError } = cam;
  const frente = cam.espejo;
  // Al salir se detiene la grabación en curso
  const cerrada = useRef(false);
  useEffect(() => {
    cerrada.current = false;
    return () => {
      cerrada.current = true; // lo que termine de grabarse después de cerrar ya no se usa
      if (reloj.current) clearInterval(reloj.current);
      if (grabadora.current?.state === "recording") grabadora.current.stop();
    };
  }, []);

  // Al cerrar se suelta el video que quedó en revisión
  useEffect(() => () => void (hecho && URL.revokeObjectURL(hecho.url)), [hecho]);

  function grabar() {
    const s = flujo.current;
    if (!s) return;
    const mime = formatoGrabacion((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return setError(mensajeCamara("SinSoporte"));
    const partes: Blob[] = [];
    const g = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
    g.ondataavailable = (e) => e.data.size && partes.push(e.data);
    g.onstop = () => {
      if (reloj.current) clearInterval(reloj.current);
      if (cerrada.current) return;
      setGrabando(false);
      const blob = new Blob(partes, { type: mime.split(";")[0] });
      if (blob.size > 0) setHecho({ blob, url: URL.createObjectURL(blob) });
    };
    grabadora.current = g;
    const inicio = Date.now();
    setSegundos(0);
    setGrabando(true);
    g.start(250);
    reloj.current = setInterval(() => {
      const t = (Date.now() - inicio) / 1000;
      setSegundos(t);
      if (t >= MAX_GRABACION && g.state === "recording") g.stop(); // se detiene sola al llegar al máximo
    }, 200);
  }

  const detener = () => grabadora.current?.state === "recording" && grabadora.current.stop();

  function repetir() {
    if (hecho) URL.revokeObjectURL(hecho.url);
    setHecho(null);
    setSegundos(0);
  }

  async function usar() {
    if (!hecho) return;
    setGuardando(true);
    try {
      await onVideo(hecho.blob);
      onCerrar();
    } catch (e) {
      setError((e as Error).message || "No se pudo guardar el video.");
      setGuardando(false);
    }
  }

  return (
    <div className="welcome-backdrop acct-capa" role="dialog" aria-modal="true" aria-label="Cámara de video">
      <div className="acct-caja camara-caja">
        <button className="acct-cerrar" onClick={onCerrar} title="Cerrar">
          <X size={20} aria-hidden />
        </button>
        <h2>Grabar video</h2>
        {error && <CamaraNoAbre error={error} detectadas={cam.lista.length} onReintentar={cam.reintentar} />}
        {!error && (
          <div className="camara-vista">
            {hecho ? (
              <video key="hecho" src={hecho.url} controls playsInline />
            ) : (
              <video key="vivo" ref={vista} playsInline muted style={{ transform: frente ? "scaleX(-1)" : undefined }} />
            )}
            {!hecho && !lista && <span className="muted">Abriendo la cámara…</span>}
            {grabando && (
              <span className="camara-reloj" data-no-translate>
                ● {relojGrabacion(segundos)}
              </span>
            )}
          </div>
        )}
        {aviso && !error && <p className="hint">{aviso}</p>}
        {!error && !hecho && <SelectorCamara lista={cam.lista} activa={cam.activa} onElegir={cam.elegir} bloqueado={grabando} />}
        {!hecho && !error && <p className="hint">Graba hasta 1 minuto. Después eliges si lo usas o lo repites.</p>}
        <div className="actions camara-botones">
          {hecho ? (
            <>
              <button className="btn ghost" disabled={guardando} onClick={repetir}>
                <RotateCcw size={18} aria-hidden /> Repetir
              </button>
              <button className="btn" disabled={guardando} onClick={() => void usar()}>
                <Check size={18} aria-hidden /> Usar este video
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost" disabled={!!error || grabando} onClick={cam.cambiar} title="Cambiar de cámara">
                <SwitchCamera size={18} aria-hidden /> Cambiar
              </button>
              {grabando ? (
                <button className="btn" onClick={detener}>
                  <Square size={16} aria-hidden /> Detener
                </button>
              ) : (
                <button className="btn" disabled={!lista || !!error} onClick={grabar}>
                  <Circle size={16} aria-hidden /> Grabar
                </button>
              )}
              <button className="btn ghost" disabled={grabando} onClick={onCerrar}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
