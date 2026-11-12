"use client";

import { RefreshCw } from "lucide-react";
import type { CamaraDetectada } from "@/lib/camara";

// Lo que comparten las dos cámaras de Studio: elegir cuál cámara usar y, si no abre, buscarla otra vez.
export function SelectorCamara({ lista, activa, onElegir, bloqueado }: { lista: CamaraDetectada[]; activa: string; onElegir: (id: string) => void; bloqueado?: boolean }) {
  if (lista.length < 2) return null;
  return (
    <div className="camara-selector">
      <label htmlFor="camara-cual">Cámara</label>
      <select id="camara-cual" value={activa} disabled={bloqueado} onChange={(e) => onElegir(e.target.value)}>
        {lista.map((c) => (
          <option key={c.id} value={c.id} data-no-translate>
            {c.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CamaraNoAbre({ error, detectadas, onReintentar }: { error: string; detectadas: number; onReintentar: () => void }) {
  return (
    <div className="camara-fallo">
      <div className="error" style={{ margin: 0 }}>{error}</div>
      <p className="hint" style={{ margin: 0 }}>
        {detectadas === 0 ? "Cámaras detectadas: ninguna." : detectadas === 1 ? "Cámaras detectadas: 1." : `Cámaras detectadas: ${detectadas}.`}
      </p>
      <button className="btn" onClick={onReintentar}>
        <RefreshCw size={16} aria-hidden /> Buscar la cámara otra vez
      </button>
    </div>
  );
}
