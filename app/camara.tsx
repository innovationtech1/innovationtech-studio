"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, SwitchCamera, X } from "lucide-react";
import { mensajeCamara, tamanoCaptura } from "@/lib/camara";

const LADO_MAXIMO = 1600;

// Cámara en vivo dentro de Studio: toma fotos sin salir de la app.
// Cada foto se entrega con onFoto (JPG en data URL). `lleno` = ya no caben más (se apaga el disparador).
export default function Camara({
  onFoto,
  onCerrar,
  lleno = false,
}: {
  onFoto: (dataUrl: string) => void | Promise<void>;
  onCerrar: () => void;
  lleno?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const [frente, setFrente] = useState(false);
  const [lista, setLista] = useState(false);
  const [error, setError] = useState("");
  const [ultima, setUltima] = useState("");
  const [tomadas, setTomadas] = useState(0);

  // Abre la cámara (trasera por defecto) y la cierra al salir o al cambiar de cámara
  useEffect(() => {
    let vivo = true;
    setLista(false);
    setError("");
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setError(mensajeCamara("SinSoporte"));
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: frente ? "user" : { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!vivo) return s.getTracks().forEach((t) => t.stop());
        flujo.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
        setLista(true);
      } catch (e) {
        if (vivo) setError(mensajeCamara((e as { name?: string }).name ?? ""));
      }
    })();
    return () => {
      vivo = false;
      flujo.current?.getTracks().forEach((t) => t.stop());
      flujo.current = null;
    };
  }, [frente]);

  async function tomar() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const { w, h } = tamanoCaptura(v.videoWidth, v.videoHeight, LADO_MAXIMO);
    const lienzo = document.createElement("canvas");
    lienzo.width = w;
    lienzo.height = h;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return setError(mensajeCamara(""));
    if (frente) {
      // La cámara frontal se ve como espejo: la foto se guarda igual que se vio
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, w, h);
    const foto = lienzo.toDataURL("image/jpeg", 0.9);
    setUltima(foto);
    setTomadas((n) => n + 1);
    await onFoto(foto);
  }

  const puedeMas = !lleno;

  return (
    <div className="welcome-backdrop acct-capa" role="dialog" aria-modal="true" aria-label="Cámara">
      <div className="acct-caja camara-caja">
        <button className="acct-cerrar" onClick={onCerrar} title="Cerrar">
          <X size={20} aria-hidden />
        </button>
        <h2>Tomar foto</h2>
        {error ? (
          <div className="error">{error}</div>
        ) : (
          <div className="camara-vista">
            <video ref={video} playsInline muted style={{ transform: frente ? "scaleX(-1)" : undefined }} />
            {!lista && <span className="muted">Abriendo la cámara…</span>}
            {ultima && <img className="camara-ultima" src={ultima} alt="Última foto tomada" />}
          </div>
        )}
        {tomadas > 0 && (
          <p className="hint">
            {tomadas === 1 ? "1 foto guardada en tu galería." : `${tomadas} fotos guardadas en tu galería.`}
            {!puedeMas && " Ya llegaste al máximo de fotos de referencia."}
          </p>
        )}
        <div className="actions camara-botones">
          <button className="btn ghost" disabled={!!error} onClick={() => setFrente((f) => !f)} title="Cambiar de cámara">
            <SwitchCamera size={18} aria-hidden /> Cambiar
          </button>
          <button className="btn" disabled={!lista || !!error || !puedeMas} onClick={() => void tomar()}>
            <Camera size={18} aria-hidden /> Tomar foto
          </button>
          <button className="btn ghost" onClick={onCerrar}>
            <Check size={18} aria-hidden /> Listo
          </button>
        </div>
      </div>
    </div>
  );
}
