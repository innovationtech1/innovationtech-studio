"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { avisoDeGaleria } from "./galeria-vista";
import { askPersistence, clearItems, deleteItem, listItems, migrateOldGallery, newId, putItem, storageUsage, StoredItem, toBlob } from "./media-store";
import type { Item } from "./types";

// Galería permanente para toda la app. Cada elemento se muestra con un enlace
// local (blob:) creado a partir del archivo guardado.
export function useGallery() {
  const [items, setItems] = useState<Item[]>([]);
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(false);
  const [error, setError] = useState("");
  const urls = useRef(new Map<string, string>()); // id -> blob: URL

  const view = (s: StoredItem): Item => {
    let url = s.url || "";
    if (s.blob) {
      if (!urls.current.has(s.id)) urls.current.set(s.id, URL.createObjectURL(s.blob));
      url = urls.current.get(s.id)!;
    }
    return { id: s.id, kind: s.kind, prompt: s.prompt, date: s.date, url, external: !s.blob, mime: s.blob?.type, blob: s.blob };
  };

  const reload = useCallback(async () => {
    try {
      const all = await listItems();
      setItems(all.map(view));
    } catch {
      setError("Tu navegador no permite guardar la galería (¿modo privado?). Descarga lo que quieras conservar.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      await migrateOldGallery();
      await reload();
      setReady(true);
    })();
    const map = urls.current;
    return () => map.forEach((u) => URL.revokeObjectURL(u));
  }, [reload]);

  // Agrega elementos. Copia el archivo (aunque venga de un enlace que caduca).
  const add = useCallback(
    async (list: { kind: "imagen" | "video"; url?: string; blob?: Blob; prompt: string }[]) => {
      // Se muestran al instante y se guardan en segundo plano
      const now = Date.now();
      const pending = list.map((it, i) => ({
        id: newId(),
        kind: it.kind,
        prompt: it.prompt,
        date: new Date(now + i).toISOString(),
        source: it,
      }));
      setItems((cur) => [
        ...pending.map((p) => {
          const url = p.source.blob ? URL.createObjectURL(p.source.blob) : p.source.url || "";
          if (p.source.blob) urls.current.set(p.id, url);
          return { id: p.id, kind: p.kind, prompt: p.prompt, date: p.date, url, mime: p.source.blob?.type, blob: p.source.blob };
        }),
        ...cur,
      ]);
      if (!persistent) askPersistence().then(setPersistent);
      for (const p of pending) {
        const blob = p.source.blob || (p.source.url ? await toBlob(p.source.url) : null);
        const elemento = { id: p.id, kind: p.kind, prompt: p.prompt, date: p.date, ...(blob ? { blob } : { url: p.source.url }) };
        try {
          // Un tropiezo pasajero del navegador no debe costar el archivo: se intenta una vez más
          await putItem(elemento).catch(() => putItem(elemento));
          setError("");
        } catch (e) {
          // Se dice la causa real: «sin espacio» solo si de verdad lo es (lib/galeria-vista.ts)
          setError(avisoDeGaleria(e, await storageUsage()));
        }
      }
    },
    [persistent]
  );

  const remove = useCallback(async (id: string) => {
    setItems((cur) => cur.filter((i) => i.id !== id));
    const u = urls.current.get(id);
    if (u) URL.revokeObjectURL(u);
    urls.current.delete(id);
    await deleteItem(id).catch(() => {});
  }, []);

  const clear = useCallback(async () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    setItems([]);
    await clearItems().catch(() => {});
  }, []);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersistent).catch(() => {});
  }, []);

  return { items, ready, add, remove, clear, persistent, error };
}
