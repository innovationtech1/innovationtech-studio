// Agrega la sesión (token de Firebase) a cada llamada a nuestras rutas /api.
// No importa Firebase: recibe una función que da el token, así se puede probar en Node.

export type ObtenerToken = (forzar: boolean) => Promise<string | null>;

export type OpcionesAuthFetch = {
  // Dónde está el fetch que se reemplaza (en el navegador, window)
  target?: { fetch: typeof fetch };
  // Origen de la app (en el navegador, location.origin)
  origin?: string;
  // Se llama cuando una ruta /api responde con error y un `codigo` (PAUSADO, PLAN, LIMITE…)
  onCodigo?: (codigo: string, mensaje: string, url: string) => void;
};

// Rutas que nunca llevan la sesión (Stripe firma sus propios avisos)
const SIN_SESION = ["/api/stripe/webhook"];

function urlDe(input: RequestInfo | URL, origin: string): URL | null {
  try {
    if (typeof input === "string") return new URL(input, origin);
    if (input instanceof URL) return input;
    return new URL(input.url, origin);
  } catch {
    return null;
  }
}

function esNuestraApi(u: URL, origin: string): boolean {
  if (u.origin !== new URL(origin).origin) return false;
  if (!u.pathname.startsWith("/api/")) return false;
  return !SIN_SESION.some((p) => u.pathname === p || u.pathname.startsWith(`${p}/`));
}

async function leerError(res: Response): Promise<{ codigo?: string; error?: string } | null> {
  if (!(res.headers.get("content-type") ?? "").includes("json")) return null;
  try {
    const v = await res.clone().json();
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export function installAuthFetch(getToken: ObtenerToken, opts: OpcionesAuthFetch = {}): () => void {
  const target = opts.target ?? (globalThis as unknown as { fetch: typeof fetch });
  const origin = opts.origin ?? (globalThis as { location?: Location }).location?.origin ?? "http://localhost";
  const original = target.fetch;
  // Siempre con su dueño: en el navegador fetch falla si se llama sin `window`
  const enviar = (input: RequestInfo | URL, init?: RequestInit) => original.call(target, input, init);

  const token = async (forzar: boolean) => {
    try {
      return await getToken(forzar);
    } catch {
      return null;
    }
  };

  // Encabezados de la llamada: los de `init` mandan; si no hay, los del Request
  const encabezados = (input: RequestInfo | URL, init?: RequestInit) =>
    new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));

  const envuelto = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const u = urlDe(input, origin);
    if (!u || !esNuestraApi(u, origin)) return enviar(input, init);

    const headers = encabezados(input, init);
    // Si ya trae su propio Authorization, no se toca ni se reintenta
    if (headers.has("authorization")) return enviar(input, init);

    // Un Request con cuerpo solo se puede enviar una vez: se guarda una copia para el reintento
    const copia = input instanceof Request ? input.clone() : null;

    const t = await token(false);
    if (t) headers.set("Authorization", `Bearer ${t}`);
    let res = await enviar(input, { ...init, headers });

    if (res.status === 401 && (await leerError(res))?.codigo === "SESION") {
      const nuevo = await token(true);
      if (nuevo) {
        const h2 = encabezados(input, init);
        h2.set("Authorization", `Bearer ${nuevo}`);
        res = await enviar(copia ?? input, { ...init, headers: h2 });
      }
    }

    if (!res.ok && opts.onCodigo) {
      const aviso = opts.onCodigo;
      // Sin esperar: quien llamó recibe la respuesta enseguida y puede leerla completa
      void leerError(res).then((e) => {
        if (e?.codigo) aviso(e.codigo, typeof e.error === "string" ? e.error : "", u.pathname);
      });
    }
    return res;
  };

  target.fetch = envuelto as typeof fetch;
  return () => {
    // Solo se deshace si nadie más lo envolvió después
    if (target.fetch === envuelto) target.fetch = original;
  };
}
