"use client";

// Adjuntar una foto para que NOVA la vea (chat de NOVA y Textos → Una publicación).
// Solo elige la foto y la achica en el aparato; quien la usa decide cuándo mandarla a ver.

import { useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { tr } from "@/lib/i18n";
import { fileToResizedDataUrl } from "@/lib/resize";
import { validarAdjunto } from "@/lib/texto-adjunto";

const LADO = 1024;

export default function FotoAdjunta({
  foto,
  onFoto,
  disabled,
  redondo,
}: {
  foto: string | null;
  onFoto: (src: string | null) => void;
  disabled?: boolean;
  redondo?: boolean; // botón de solo icono (la caja del chat)
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    const v = validarAdjunto(archivo);
    if (!v.ok || v.tipo !== "imagen") return setError(v.ok ? "Aquí solo se puede adjuntar una foto." : v.error);
    setOcupado(true);
    setError("");
    try {
      onFoto(await fileToResizedDataUrl(archivo, LADO));
    } catch {
      setError("No pude leer esa foto. Prueba con otra.");
    }
    setOcupado(false);
  }

  return (
    <span className={`foto-adj${redondo ? " redondo" : ""}`}>
      {foto && (
        <span className="foto-adj-previa">
          <img src={foto} alt={tr("Foto adjunta")} />
          <button type="button" onClick={() => onFoto(null)} disabled={disabled} aria-label={tr("Quitar la foto")}>
            <X size={13} aria-hidden />
          </button>
        </span>
      )}
      <label className={`foto-adj-boton${disabled || ocupado ? " disabled" : ""}`} title={tr("Adjuntar foto")}>
        {ocupado ? <Loader2 size={18} className="spin" aria-hidden /> : <ImagePlus size={18} aria-hidden />}
        {redondo ? <span className="sr-only">Adjuntar foto</span> : <span>{foto ? "Cambiar foto" : "Adjuntar foto"}</span>}
        <input
          type="file"
          accept="image/*"
          hidden
          disabled={disabled || ocupado}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void elegir(f);
          }}
        />
      </label>
      {error && (
        <span className="foto-adj-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
