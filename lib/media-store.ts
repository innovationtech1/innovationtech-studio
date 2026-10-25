// Galería permanente: guarda imágenes y videos en IndexedDB, el almacenamiento
// grande del navegador (cientos de MB, frente a ~5 MB de localStorage).
// Todo se queda en el dispositivo de cada persona.

import type { Item } from "./types";

const DB = "innovationtech-studio";
const STORE = "galeria";
const FILES = "archivos";

export type StoredItem = {
  id: string;
  kind: "imagen" | "video";
  prompt: string;
  date: string;
  blob?: Blob; // el archivo en sí
  url?: string; // solo si no se pudo copiar (enlace externo)
};

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("Sin almacenamiento"));
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" }).createIndex("date", "date");
        // Archivos de los proyectos de video (para que no se pierdan al cerrar la app)
        if (!d.objectStoreNames.contains(FILES)) d.createObjectStore(FILES);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error("No hay espacio suficiente en el dispositivo."));
      })
  );
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Convierte cualquier enlace (data:, blob:, https:) en archivo; null si no se puede.
export async function toBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function putItem(item: StoredItem) {
  await tx("readwrite", (s) => s.put(item));
}

export async function listItems(): Promise<StoredItem[]> {
  const all = await tx<StoredItem[]>("readonly", (s) => s.getAll());
  return (all || []).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function deleteItem(id: string) {
  await tx("readwrite", (s) => s.delete(id));
}

// ---------- Archivos de proyectos ----------
export async function putFile(id: string, blob: Blob) {
  const d = await db();
  await new Promise<void>((res, rej) => {
    const t = d.transaction(FILES, "readwrite");
    t.objectStore(FILES).put(blob, id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error("Sin espacio en el dispositivo."));
  });
}
export async function getFile(id: string): Promise<Blob | null> {
  const d = await db();
  return new Promise((res) => {
    const r = d.transaction(FILES, "readonly").objectStore(FILES).get(id);
    r.onsuccess = () => res((r.result as Blob) || null);
    r.onerror = () => res(null);
  });
}
export async function deleteFile(id: string) {
  const d = await db();
  await new Promise<void>((res) => {
    const t = d.transaction(FILES, "readwrite");
    t.objectStore(FILES).delete(id);
    t.oncomplete = () => res();
    t.onerror = () => res();
  });
}

export async function clearItems() {
  await tx("readwrite", (s) => s.clear());
}

// Pide al navegador que no borre la galería cuando falte espacio.
export async function askPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageUsage(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { used: e.usage || 0, quota: e.quota || 0 } : null;
  } catch {
    return null;
  }
}

// Mueve la galería antigua (localStorage) a la nueva, una sola vez.
export async function migrateOldGallery() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem("its-gallery");
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const old = JSON.parse(raw) as Item[];
    for (const it of old.reverse()) {
      const blob = await toBlob(it.url);
      await putItem({ id: newId(), kind: it.kind, prompt: it.prompt, date: it.date, ...(blob ? { blob } : { url: it.url }) });
    }
    localStorage.removeItem("its-gallery");
  } catch {
    /* se intentará de nuevo la próxima vez */
  }
}

// Convierte un enlace temporal (blob:) en data URL para guardarlo en borradores.
export async function toDataUrl(url: string): Promise<string> {
  if (!url.startsWith("blob:")) return url;
  const blob = await toBlob(url);
  if (!blob) return url;
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => resolve(url);
    r.readAsDataURL(blob);
  });
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
