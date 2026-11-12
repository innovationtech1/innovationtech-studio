"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle, RotateCcw, Square, SwitchCamera, X } from "lucide-react";
import { MAX_GRABACION, formatoGrabacion, mensajeCamara, relojGrabacion } from "@/lib/camara";

// Cámara de video dentro de Studio: graba con imagen y sonido (hasta 60 s) sin salir de la app.
// Al terminar se puede repetir o usar; el video se entrega con onVideo.
export default function CamaraVideo({ onVideo, onCerrar }: { onVideo: (video: Blob) => void | Promise<void>; onCerrar: () => void }) {
  const vista = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const grabadora = useRef<MediaRecorder | null>(null);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);
  const [frente, setFrente] = useState(false);
  const [lista, setLista] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [hecho, setHecho] = useState<{ blob: Blob; url: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Abre la cámara con micrófono (trasera por defecto). Si niegan el micrófono, graba sin sonido y avisa.
  useEffect(() => {
    if (hecho) return; // revisando lo grabado: la cámara descansa
    let vivo = true;
    setLista(false);
    setError("");
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setError(mensajeCamara("SinSoporte"));
      const imagen = { facingMode: frente ? "user" : { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } };
      try {
        let s: MediaStream;
        try {
          s = await navigator.mediaDevices.getUserMedia({ video: imagen, audio: true });
          setAviso("");
        } catch {
          // Puede ser solo el micrófono: se intenta sin sonido
          s = await navigator.mediaDevices.getUserMedia({ video: imagen, audio: false });
          setAviso(mensajeCamara("SinMicrofono"));
        }
        if (!vivo) return s.getTracks().forEach((t) => t.stop());
        flujo.current = s;
        if (vista.current) {
          vista.current.srcObject = s;
          await vista.current.play().catch(() => {});
        }
        setLista(true);
      } catch (e) {
        if (vivo) setError(mensajeCamara((e as { name?: string }).name ?? ""));
      }
    })();
    return () => {
      vivo = false;
      if (reloj.current) clearInterval(reloj.current);
      if (grabadora.current?.state === "recording") grabadora.current.stop();
      flujo.current?.getTracks().forEach((t) => t.stop());
      flujo.current = null;
    };
  }, [frente, hecho]);

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
        {error && <div className="error">{error}</div>}
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
              <button className="btn ghost" disabled={!!error || grabando} onClick={() => setFrente((f) => !f)} title="Cambiar de cámara">
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
