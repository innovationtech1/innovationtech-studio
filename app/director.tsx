"use client";

import { useEffect, useState } from "react";
import { Send, Undo2, Wand2 } from "lucide-react";
import MicButton from "./mic-button";
import { MAX_ORDEN } from "@/lib/director";

const EJEMPLOS = [
  "Hazme un video de mi promoción de esta semana",
  "Pon todos los textos arriba y grandes",
  "Que dure 30 segundos con música alegre",
];

// Director con IA: la persona escribe o dicta una orden y la IA arma o corrige el video.
// Este bloque solo muestra y recoge; quien aplica la orden es el Creador de Reels.
export default function Director({
  ocupado,
  cfHeaders,
  onEnviar,
  confirmar,
  resultado,
  onDeshacer,
  sugerida,
}: {
  sugerida?: { text: string; n: number } | null; // un tema que llega de otra sección (calendario, asistente): queda escrito, listo para enviar
  ocupado: boolean;
  cfHeaders: Record<string, string>;
  onEnviar: (orden: string) => void;
  confirmar: { texto: string; onSi: () => void; onNo: () => void } | null; // antes de gastar imágenes o voz
  resultado: { mensaje: string; hecho: string[]; avisos: string[] } | null;
  onDeshacer: (() => void) | null; // null = no hay orden que deshacer
}) {
  const [orden, setOrden] = useState("");
  const [dictando, setDictando] = useState("");
  useEffect(() => {
    if (sugerida?.text) setOrden(`Hazme un video de: ${sugerida.text}`.slice(0, MAX_ORDEN));
  }, [sugerida]);
  const lista = orden.trim();
  const enviar = () => {
    if (!lista || ocupado || confirmar) return;
    onEnviar(lista);
    setOrden("");
    setDictando("");
  };

  return (
    <div className="dir">
      <div className="dir-titulo">
        <Wand2 size={18} aria-hidden />
        <strong>¿Qué video quieres?</strong>
        <span className="muted">Escribe o dicta tu idea y la IA arma el video. Después pídele cambios aquí mismo.</span>
      </div>
      <div className="dir-fila">
        <input
          value={dictando || orden}
          maxLength={MAX_ORDEN}
          disabled={ocupado}
          onChange={(e) => (setDictando(""), setOrden(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="Ej.: Hazme un video de 30 segundos de mi promoción de esta semana"
          aria-label="Orden para la IA"
        />
        <MicButton
          cfHeaders={cfHeaders}
          disabled={ocupado || !!confirmar}
          onInterim={setDictando}
          onText={(t) => (setDictando(""), setOrden((o) => `${o} ${t}`.trim().slice(0, MAX_ORDEN)))}
        />
        <button type="button" className="btn" disabled={ocupado || !!confirmar || !lista} onClick={enviar}>
          <Send size={16} aria-hidden /> Enviar
        </button>
      </div>
      {!resultado && !confirmar && (
        <div className="dir-ejemplos">
          {EJEMPLOS.map((e) => (
            <button type="button" key={e} className="btn ghost small" disabled={ocupado} onClick={() => setOrden(e)}>
              {e}
            </button>
          ))}
        </div>
      )}
      {confirmar && (
        <div className="acct-upsell dir-confirmar">
          <span>{confirmar.texto}</span>
          <div className="actions">
            <button type="button" className="btn small" disabled={ocupado} onClick={confirmar.onSi}>
              Hacerlo
            </button>
            <button type="button" className="btn ghost small" disabled={ocupado} onClick={confirmar.onNo}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {resultado && !confirmar && (
        <div className="dir-resultado">
          {resultado.mensaje && <p data-no-translate>{resultado.mensaje}</p>}
          {resultado.hecho.length > 0 && (
            <ul>
              {resultado.hecho.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}
          {resultado.avisos.map((a, i) => (
            <p key={i} className="dir-aviso">
              {a}
            </p>
          ))}
          {onDeshacer && (
            <button type="button" className="btn ghost small" disabled={ocupado} onClick={onDeshacer}>
              <Undo2 size={15} aria-hidden /> Deshacer orden
            </button>
          )}
        </div>
      )}
    </div>
  );
}
