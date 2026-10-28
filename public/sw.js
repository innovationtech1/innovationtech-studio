// Service worker de InnovationTECH Studio.
// Permite instalar la app y que abra rápido; si no hay internet muestra una pantalla de aviso.
// Nunca guarda en caché las llamadas a /api (claves y contenido generado).

const VERSION = "its-v2";
const MAX_ENTRIES = 120; // evita que la caché crezca sin fin con archivos de versiones anteriores

// Borra los archivos más viejos cuando la caché pasa del límite (se guardan en orden de llegada).
async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_ENTRIES;
  for (let i = 0; i < extra; i++) {
    const path = new URL(keys[i].url).pathname;
    if (!SHELL.includes(path)) await cache.delete(keys[i]);
  }
}
const SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // imágenes y videos de proveedores: directo
  if (url.pathname.startsWith("/api/")) return; // nunca en caché

  // Páginas: primero la red (siempre la versión más nueva); sin conexión, la copia o el aviso.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("/", copy));
          return res;
        })
        .catch(async () => (await caches.match("/")) || caches.match("/offline.html"))
    );
    return;
  }

  // Archivos estáticos con nombre único (/_next/static) e íconos: primero la caché.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy).then(() => trim(c)));
            }
            return res;
          })
      )
    );
  }
});
