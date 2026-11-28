"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, Sparkles } from "lucide-react";
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

// «Editar con IA»: la persona escribe (o dicta) qué cambiar de su foto y NOVA lo hace.
// Muestra el antes y el después para comparar; nada cambia en el diseño hasta tocar «Usar esta».
export default function EditarIA({
  src,
  cfHeaders,
  onApply,
  onClose,
}: {
  src: string;
  cfHeaders: Record<string, string>;
  onApply: (url: string, formato?: FormatoExtension) => void | Promise<void>;
  onClose: () => void;
}) {
  const [pedido, setPedido] = useState("");
  const [estado, setEstado] = useState<Estado>({ paso: "pedir" });
  const [corte, setCorte] = useState(50); // por dónde va la línea del antes/después
  const control = useRef<AbortController | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const soltar = () => {
    control.current?.abort();
    control.current = null;
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = null;
  };
  useEffect(() => soltar, []);
  // El panel sale debajo del lienzo: al abrirse, la pantalla baja hasta él y el cursor queda listo para escribir.
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    caja.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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
      setEstado({ paso: "listo", url: r.url, formato: r.formato as FormatoExtension | undefined });
    } else setEstado({ paso: "error", error: r.error || "No pude editar la foto en este momento." });
  }

  const cancelar = () => {
    soltar();
    setEstado({ paso: "pedir" });
  };

  const trabajando = estado.paso === "trabajando";
  const listo = estado.paso === "listo";

  return (
    <div className="props editar-ia" ref={caja}>
      <div className="card-head">
        <strong>
          <Sparkles size={16} aria-hidden /> Editar con IA
        </strong>
        <button className="btn ghost small" onClick={() => (soltar(), onClose())}>
          Cerrar
        </button>
      </div>

      <div className="guiado-nova" role="status" aria-live="polite">
        <NovaAvatar estado={trabajando ? "pensando" : listo ? "aviso" : "hablando"} tamano={44} />
        <p>{mensajeNovaEdicion(estado)}</p>
      </div>

      {listo ? (
        // Con otro formato (extender) las dos fotos no coinciden: se muestran una junto a la otra.
        estado.formato ? (
          <div className="editar-ia-lado">
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
          <div className="editar-ia-comparar">
            <div className="editar-ia-marco">
              <img src={estado.url} alt="Después" />
              <img src={src} alt="Antes" className="antes" style={{ clipPath: `inset(0 ${100 - corte}% 0 0)` }} />
              <span className="linea" style={{ left: `${corte}%` }} aria-hidden />
              <span className="rotulo izq">Antes</span>
              <span className="rotulo der">Después</span>
            </div>
            <input type="range" min={0} max={100} value={corte} onChange={(e) => setCorte(Number(e.target.value))} aria-label="Comparar antes y después" />
          </div>
        )
      ) : (
        <div className={`editar-ia-foto${trabajando ? " ocupada" : ""}`}>
          <img src={src} alt="" />
        </div>
      )}

      {listo ? (
        <div className="actions">
          <button className="btn" onClick={() => onApply(estado.url, estado.formato)}>
            <Check size={16} aria-hidden /> Usar esta
          </button>
          <button className="btn ghost" onClick={() => editar()}>
            <RotateCcw size={16} aria-hidden /> Probar otra vez
          </button>
          <button className="btn ghost" onClick={() => setEstado({ paso: "pedir" })}>
            Pedir otra cosa
          </button>
        </div>
      ) : trabajando ? (
        <div className="actions">
          {estado.lento && (
            <button className="btn" onClick={() => editar()}>
              <RotateCcw size={16} aria-hidden /> Volver a empezar
            </button>
          )}
          <button className="btn ghost" onClick={cancelar}>
            Cancelar
          </button>
        </div>
      ) : (
        <>
          <div className="editar-ia-pedido">
            <textarea
              rows={2}
              value={pedido}
              maxLength={300}
              placeholder="Ej.: quita la servilleta de la mesa"
              aria-label="Qué quieres cambiar de la foto"
              onChange={(e) => setPedido(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  editar();
                }
              }}
            />
            <MicButton cfHeaders={cfHeaders} onText={(t) => setPedido((p) => `${p} ${t}`.trim().slice(0, 300))} />
          </div>
          <div className="editar-ia-ejemplos">
            {EJEMPLOS_EDICION.map((e) => (
              <button key={e} className="chip" onClick={() => setPedido(e)}>
                {e}
              </button>
            ))}
          </div>
          <div className="actions">
            <button className="btn" onClick={() => editar()} disabled={!limpiarPedido(pedido)}>
              <Sparkles size={16} aria-hidden /> {estado.paso === "error" ? "Volver a intentar" : "Editar"}
            </button>
            <span className="muted">Cada edición cuenta como 1 imagen de tu plan.</span>
          </div>
        </>
      )}
    </div>
  );
}
