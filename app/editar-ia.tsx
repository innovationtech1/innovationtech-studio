"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw, Sparkles, X } from "lucide-react";
import { EJEMPLOS_EDICION, type FormatoExtension, type TipoEdicion, clasificarEdicion, limpiarPedido, mensajeNovaEdicion } from "@/lib/editar-ia";
import { pedirEdicion } from "@/lib/editar-ia-cliente";
import MicButton from "./mic-button";
import NovaAvatar from "./nova-avatar";

const AVISO_LENTO = 20_000;

type Estado =
  | { paso: "pedir" }
  | { paso: "trabajando"; tipo: TipoEdicion; lento: boolean }
  | { paso: "listo"; url: string; formato?: FormatoExtension }
  | { paso: "pronto" }
  | { paso: "error"; error: string };

// «Editar con IA»: una barra pegada a la foto. La persona escribe (o dicta) qué cambiar y NOVA lo hace.
// El antes/después sale encima de la foto del Editor («lienzo»), sin bajar la pantalla.
// Nada cambia en el diseño hasta tocar «Usar esta».
export default function EditarIA({
  src,
  lienzo,
  cfHeaders,
  onApply,
  onClose,
}: {
  src: string;
  lienzo: HTMLElement | null; // el marco de la foto del Editor
  cfHeaders: Record<string, string>;
  onApply: (url: string, formato?: FormatoExtension) => void | Promise<void>;
  onClose: () => void;
}) {
  const [pedido, setPedido] = useState("");
  const [estado, setEstado] = useState<Estado>({ paso: "pedir" });
  const [corte, setCorte] = useState(50); // por dónde va la línea del antes/después
  const [medida, setMedida] = useState<[number, number] | null>(null); // tamaño de la foto editada
  const control = useRef<AbortController | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barra = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLInputElement>(null);

  const soltar = () => {
    control.current?.abort();
    control.current = null;
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = null;
  };
  useEffect(() => soltar, []);
  // Al abrir: la barra a la vista y el cursor listo para escribir.
  useEffect(() => {
    barra.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    caja.current?.focus({ preventScroll: true });
  }, []);

  // Mientras trabaja y al mostrar el resultado, la barra sube al borde y la foto queda a la vista debajo (en teléfono no caben las dos si no).
  const paso = estado.paso;
  useEffect(() => {
    if (paso !== "trabajando" && paso !== "listo") return;
    if (!lienzo || lienzo.getBoundingClientRect().bottom <= window.innerHeight) return;
    barra.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [paso, lienzo]);

  async function editar(texto = pedido) {
    const limpio = limpiarPedido(texto);
    if (!limpio) return;
    const tipo = clasificarEdicion(limpio);
    if (tipo === "mejorar") return setEstado({ paso: "pronto" });
    soltar();
    const c = new AbortController();
    control.current = c;
    setEstado({ paso: "trabajando", tipo, lento: false });
    reloj.current = setTimeout(() => setEstado((e) => (e.paso === "trabajando" ? { ...e, lento: true } : e)), AVISO_LENTO);
    const r = await pedirEdicion(src, limpio, cfHeaders, c.signal);
    if (c.signal.aborted) return;
    soltar();
    if (r.url) {
      setCorte(50);
      setMedida(null);
      setEstado({ paso: "listo", url: r.url, formato: r.formato as FormatoExtension | undefined });
    } else setEstado({ paso: "error", error: r.error || "No pude editar la foto en este momento." });
  }

  const volver = () => {
    soltar();
    setEstado({ paso: "pedir" });
    setTimeout(() => caja.current?.focus({ preventScroll: true }), 0);
  };

  const trabajando = estado.paso === "trabajando";
  const listo = estado.paso === "listo";

  // El antes/después ocupa el mismo lugar que la foto, sin deformarse.
  const hueco: [number, number] = lienzo ? [Math.max(120, lienzo.clientWidth - 16), Math.max(120, lienzo.clientHeight - 16)] : [320, 320];
  const k = medida ? Math.min(hueco[0] / medida[0], hueco[1] / medida[1]) : 0;

  return (
    <div className="editar-ia" ref={barra}>
      <div className="editar-ia-barra">
        <NovaAvatar estado={trabajando ? "pensando" : listo ? "aviso" : "hablando"} tamano={36} />
        {listo ? (
          <div className="editar-ia-acciones">
            <button className="btn small" onClick={() => onApply(estado.url, estado.formato)}>
              <Check size={16} aria-hidden /> Usar esta
            </button>
            <button className="btn ghost small" onClick={() => editar()}>
              <RotateCcw size={16} aria-hidden /> Probar otra vez
            </button>
            <button className="btn ghost small" onClick={volver}>
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <input
              ref={caja}
              type="text"
              value={pedido}
              maxLength={300}
              disabled={trabajando}
              placeholder="¿Qué quieres cambiar? Ej.: quita la servilleta de la mesa"
              aria-label="Qué quieres cambiar de la foto"
              enterKeyHint="go"
              onChange={(e) => setPedido(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editar();
                }
              }}
            />
            {trabajando ? (
              <>
                {estado.lento && (
                  <button className="btn small" onClick={() => editar()}>
                    <RotateCcw size={16} aria-hidden /> Volver a empezar
                  </button>
                )}
                <button className="btn ghost small" onClick={volver}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <MicButton cfHeaders={cfHeaders} onText={(t) => setPedido((p) => `${p} ${t}`.trim().slice(0, 300))} />
                <button className="btn small" onClick={() => editar()} disabled={!limpiarPedido(pedido)}>
                  <Sparkles size={16} aria-hidden /> {estado.paso === "error" ? "Volver a intentar" : "Editar"}
                </button>
              </>
            )}
          </>
        )}
        <button className="editar-ia-cerrar" onClick={() => (soltar(), onClose())} aria-label="Cerrar Editar con IA" title="Cerrar">
          <X size={18} aria-hidden />
        </button>
      </div>

      {estado.paso === "pedir" ? (
        !limpiarPedido(pedido) && (
          <div className="editar-ia-ejemplos">
            {EJEMPLOS_EDICION.map((e) => (
              <button key={e} onClick={() => (setPedido(e), caja.current?.focus({ preventScroll: true }))}>
                {e}
              </button>
            ))}
            <span className="muted">Cada edición cuenta como 1 imagen de tu plan.</span>
          </div>
        )
      ) : (
        <p className="editar-ia-estado" role="status" aria-live="polite">
          {mensajeNovaEdicion(estado)}
        </p>
      )}

      {lienzo &&
        createPortal(
          trabajando ? (
            <div className="editar-ia-velo" aria-hidden />
          ) : listo ? (
            <div className="editar-ia-encima">
              {estado.formato ? (
                // Con otro formato (extender) las dos fotos no coinciden: van una junto a la otra.
                <div className="editar-ia-lado" style={{ height: hueco[1] }}>
                  <figure>
                    <img src={src} alt="" />
                    <figcaption>Antes</figcaption>
                  </figure>
                  <figure>
                    <img src={estado.url} alt="" />
                    <figcaption>Después</figcaption>
                  </figure>
                </div>
              ) : (
                <div className="editar-ia-marco" style={medida ? { width: Math.round(medida[0] * k), height: Math.round(medida[1] * k) } : { width: 1, height: 1, opacity: 0 }}>
                  <img src={estado.url} alt="Después" onLoad={(e) => setMedida([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} />
                  <img src={src} alt="Antes" style={{ clipPath: `inset(0 ${100 - corte}% 0 0)` }} />
                  <span className="linea" style={{ left: `${corte}%` }} aria-hidden />
                  <span className="rotulo izq">Antes</span>
                  <span className="rotulo der">Después</span>
                  <input type="range" min={0} max={100} value={corte} onChange={(e) => setCorte(Number(e.target.value))} aria-label="Comparar antes y después" />
                </div>
              )}
            </div>
          ) : null,
          lienzo
        )}
    </div>
  );
}
