"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Clock, CirclePause, Gauge, X } from "lucide-react";

// Mientras se muestra un aviso fijo arriba, el resto de la app baja un poco para no quedar tapada.
// Con `medir`, el aviso puede crecer (su texto ocupa 2 o más renglones en un celular angosto):
// se mide su alto real y la app baja exactamente eso (--acct-espacio).
function useEspacioArriba(medir?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    document.body.classList.add("acct-con-aviso");
    const el = medir?.current;
    let obs: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== "undefined") {
      const poner = () => document.body.style.setProperty("--acct-espacio", `${Math.ceil(el.getBoundingClientRect().height)}px`);
      poner();
      obs = new ResizeObserver(poner);
      obs.observe(el);
    }
    return () => {
      obs?.disconnect();
      document.body.style.removeProperty("--acct-espacio");
      document.body.classList.remove("acct-con-aviso");
    };
  }, [medir]);
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// Cuenta regresiva de la prueba Pro. Al llegar a 0 avisa (onFin) para volver a leer la cuenta.
export default function TrialBanner({
  hasta,
  onElegir,
  onFin,
}: {
  hasta: number;
  onElegir: () => void;
  onFin: () => void;
}) {
  useEspacioArriba();
  const [ahora, setAhora] = useState(() => Date.now());
  const fin = useRef(onFin);
  fin.current = onFin;

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const resta = hasta - ahora;
  const terminado = resta <= 0;
  useEffect(() => {
    if (!terminado) return;
    fin.current();
    // Por si el reloj del servidor va unos segundos atrás, se vuelve a revisar
    const t = setTimeout(() => fin.current(), 3000);
    return () => clearTimeout(t);
  }, [terminado]);

  return (
    <div className="acct-aviso" role="status">
      <span>
        <Clock size={16} aria-hidden /> <strong>Prueba Pro:</strong> te quedan <span data-no-translate>{mmss(resta)}</span>
      </span>
      <button className="btn small" onClick={onElegir}>
        Elegir plan
      </button>
    </div>
  );
}

// Aviso de cuenta en pausa: la app sigue visible (galería y Mi marca); el servidor no deja crear.
export function PausaBanner({ onPagar, ocupado }: { onPagar: () => void; ocupado: boolean }) {
  useEspacioArriba();
  return (
    <div className="acct-aviso pausa" role="status">
      <span>
        <CirclePause size={16} aria-hidden /> <strong>Tu cuenta está en pausa.</strong>
      </span>
      <button className="btn small" onClick={onPagar} disabled={ocupado}>
        Pagar para reactivar
      </button>
    </div>
  );
}

// Aviso suave: ya usó el 80% de lo incluido este mes en un contador. Se queda hasta que lo cierre.
export function AvisoUsoBanner({ texto, onVer, onCerrar }: { texto: string; onVer: () => void; onCerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  useEspacioArriba(caja);
  return (
    <div className="acct-aviso uso" role="status" ref={caja}>
      <span>
        <Gauge size={16} aria-hidden /> {texto}
      </span>
      <button className="btn small" onClick={onVer}>
        Ver paquetes
      </button>
      <button className="acct-cerrar-toast" onClick={onCerrar} title="Cerrar">
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
