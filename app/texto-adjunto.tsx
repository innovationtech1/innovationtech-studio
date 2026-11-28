"use client";

// Textos: «Publicar». Se adjunta una imagen o un video (subido o de la galería) y se comparte junto con
// el texto; sin adjunto, se comparte solo el texto. Las reglas están en lib/texto-adjunto.ts.
// El adjunto vive mientras la app está abierta: es para compartir en el momento.

import { useEffect, useRef, useState } from "react";
import { Images, Paperclip, Send, X } from "lucide-react";
import { compartirTexto, nombreAdjunto, validarAdjunto, type TipoAdjunto } from "@/lib/texto-adjunto";
import type { Item } from "@/lib/types";
import CompartirBotones from "./compartir-botones";

type Adjunto = { tipo: TipoAdjunto; src: Blob | string; vista: string; nombre: string };

// `inicial`: la foto que la persona adjuntó para que NOVA escribiera el texto; queda puesta para publicar
export default function PublicarTexto({ texto, gallery, inicial }: { texto: string; gallery: Item[]; inicial?: string | null }) {
  const [adjunto, setAdjunto] = useState<Adjunto | null>(null);
  const [galeria, setGaleria] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const propia = useRef<string | null>(null); // la vista previa creada aquí (hay que soltarla)

  const soltar = () => {
    if (propia.current) URL.revokeObjectURL(propia.current);
    propia.current = null;
  };
  useEffect(() => soltar, []);
  const puesta = useRef<string | null>(null);
  useEffect(() => {
    if (!inicial || inicial === puesta.current) return;
    puesta.current = inicial;
    poner({ tipo: "imagen", src: inicial, vista: inicial, nombre: nombreAdjunto("imagen", inicial.slice(5, inicial.indexOf(";"))) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicial]);

  function poner(a: Adjunto | null, vistaPropia = false) {
    soltar();
    if (a && vistaPropia) propia.current = a.vista;
    setAdjunto(a);
    setError("");
    setAviso("");
    setGaleria(false);
  }

  function subir(archivo: File | undefined) {
    if (!archivo) return;
    const v = validarAdjunto(archivo);
    if (!v.ok) return setError(v.error);
    poner({ tipo: v.tipo, src: archivo, vista: URL.createObjectURL(archivo), nombre: nombreAdjunto(v.tipo, archivo.type) }, true);
  }

  function deGaleria(g: Item) {
    const tipo: TipoAdjunto = g.kind === "video" ? "video" : "imagen";
    poner({ tipo, src: g.blob ?? g.url, vista: g.url, nombre: nombreAdjunto(tipo, g.blob?.type || g.mime || "") });
  }

  async function soloTexto() {
    setError("");
    const r = await compartirTexto(texto);
    setAviso(r === "copiado" ? "Se copió el texto: pégalo donde lo vas a publicar." : "");
    if (r === "fallo") setError("No se pudo compartir ni copiar el texto. Selecciónalo y cópialo a mano.");
    if (r === "vacio") setError("Todavía no hay texto para compartir.");
  }

  const elementos = gallery.slice(0, 30);

  return (
    <div className="adj">
      <div className="adj-titulo">
        <Send size={18} aria-hidden />
        <strong>Publicar</strong>
        <span className="muted">Agrega una imagen o un video, o comparte solo el texto.</span>
      </div>
      {adjunto && (
        <div className="adj-previa">
          {adjunto.tipo === "video" ? <video src={adjunto.vista} controls playsInline preload="metadata" /> : <img src={adjunto.vista} alt="Imagen para publicar" />}
          <button type="button" className="btn ghost small" onClick={() => poner(null)}>
            <X size={14} aria-hidden /> Quitar
          </button>
        </div>
      )}
      <div className="actions">
        <label className="btn ghost small" style={{ margin: 0 }}>
          <Paperclip size={15} aria-hidden /> {adjunto ? "Cambiar archivo" : "Subir imagen o video"}
          <input
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              subir(f);
            }}
          />
        </label>
        <button type="button" className="btn ghost small" onClick={() => setGaleria((v) => !v)} aria-expanded={galeria}>
          <Images size={15} aria-hidden /> Elegir de mi galería
        </button>
        {!adjunto && (
          <button type="button" className="btn small" onClick={() => void soloTexto()}>
            <Send size={15} aria-hidden /> Compartir texto
          </button>
        )}
      </div>
      {galeria && (
        <div className="picker">
          {elementos.length === 0 && <span className="muted">Tu galería está vacía.</span>}
          {elementos.map((g, k) => (
            <button type="button" key={g.url + k} className="pick-item" onClick={() => deGaleria(g)} aria-label={g.kind === "video" ? "Usar este video" : "Usar esta imagen"}>
              {g.kind === "video" ? <video src={g.url} muted playsInline preload="metadata" /> : <img src={g.url} alt="" />}
            </button>
          ))}
        </div>
      )}
      {adjunto && <CompartirBotones key={adjunto.vista} src={adjunto.src} nombre={adjunto.nombre} texto={texto} />}
      {aviso && <p className="notice">{aviso}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
