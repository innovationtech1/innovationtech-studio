"use client";

import { useCallback, useEffect, useState } from "react";

export type DemoStatus = {
  demo: boolean;
  limits: { text: number; image: number; voice: number } | null;
  remaining: { text: number; image: number; voice: number } | null;
};

// Consulta si el modo demo está disponible y cuántos usos quedan hoy.
export function useDemo() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      if (r.ok) setStatus(await r.json());
    } catch {
      /* sin conexión */
    }
  }, []);
  useEffect(() => {
    refresh();
    // Se actualiza después de cada pedido a la IA
    const orig = window.fetch;
    const wrapped: typeof fetch = async (...args) => {
      const res = await orig(...args);
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0]);
      if (/\/api\/(text|image|voice)$/.test(url)) setTimeout(refresh, 300);
      return res;
    };
    window.fetch = wrapped;
    return () => {
      if (window.fetch === wrapped) window.fetch = orig;
    };
  }, [refresh]);
  return { status, refresh };
}
