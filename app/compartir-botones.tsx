"use client";
import { useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { aArchivo, compartirArchivos, descargarArchivo } from "@/lib/compartir";

const AVISO_DESCARGA =
  "Tu navegador no deja compartir este archivo: lo descargamos. Súbelo desde tu aparato a la red que quieras.";
const AVISO_TEXTO = "Se copió el texto para publicar: pégalo en la descripción.";

type Fuente = Blob | string;

// «Compartir» junto a cada «Descargar»: abre el menú del teléfono o de la computadora con el archivo.
// Si el navegador no puede, descarga el archivo y lo explica. Si el archivo no se deja leer
// (p. ej. un enlace remoto protegido), el botón se oculta y queda solo «Descargar».
// `src` puede ser una función cuando el archivo se arma en el momento del toque (p. ej. la portada).
export default function CompartirBotones({
  src,
  nombre,
  texto,
  compacto,
}: {
  src: Fuente | (() => Fuente | null);
  nombre: string;
  texto?: string;
  compacto?: boolean;
}) {
  const [preparando, setPreparando] = useState(false);
  const [oculto, setOculto] = useState(false);
  const [aviso, setAviso] = useState("");
  const ocupado = useRef(false);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  if (oculto) return null;

  async function compartir() {
    if (ocupado.current) return;
    ocupado.current = true;
    setPreparando(true);
    setAviso("");
    try {
      const fuente = typeof src === "function" ? src() : src;
      if (!fuente) return;
      const archivo = await aArchivo(fuente, nombre);
      if (!archivo) {
        setOculto(true);
        return;
      }
      const r = await compartirArchivos([archivo], texto);
      if (r === "descargar") {
        descargarArchivo(archivo);
        setAviso(AVISO_DESCARGA);
      } else if (r === "compartido" && texto) setAviso(AVISO_TEXTO);
    } finally {
      ocupado.current = false;
      setPreparando(false);
    }
  }

  const etiqueta = preparando ? "Preparando…" : "Compartir";
  return (
    <span className={`compartir${compacto ? " compacto" : ""}`}>
      {compacto ? (
        <button type="button" title={etiqueta} aria-label={etiqueta} disabled={preparando} onClick={compartir}>
          <Share2 size={17} aria-hidden />
        </button>
      ) : (
        <button type="button" className="btn ghost small" disabled={preparando} onClick={compartir}>
          <Share2 size={15} aria-hidden /> {etiqueta}
        </button>
      )}
      {aviso && (
        <span className="notice compartir-aviso" role="status">
          {aviso}
        </span>
      )}
    </span>
  );
}
