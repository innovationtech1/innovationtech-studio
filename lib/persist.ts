"use client";

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";

// Igual que useState, pero guarda el valor en el navegador para que no se pierda
// al cerrar la app o recargar la página. Si el navegador no permite guardar
// (modo privado, sin espacio), sigue funcionando normal en memoria.
// `fallback` se usa si el valor no cabe (por ejemplo, quitando las imágenes y dejando solo los textos).
export function usePersistentState<T>(
  key: string,
  initial: T,
  fallback?: (value: T) => T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);

  // Cargar después de montar (evita diferencias entre servidor y navegador).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`its-draft:${key}`);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* sin almacenamiento */
    }
    loaded.current = true;
  }, [key]);

  // Guardar con una pequeña pausa para no escribir en cada tecla.
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(`its-draft:${key}`, JSON.stringify(value));
      } catch {
        try {
          if (fallback) localStorage.setItem(`its-draft:${key}`, JSON.stringify(fallback(value)));
        } catch {
          /* sin espacio o sin almacenamiento: se queda solo en memoria */
        }
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  return [value, setValue];
}

// Borra todos los borradores guardados (botón «Limpiar» de cada sección).
export function clearDrafts(prefix: string) {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(`its-draft:${prefix}`))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* nada */
  }
}
