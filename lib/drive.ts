// Cliente de Google Drive (solo lógica, sin pantalla): carpeta «InnovationTECH Studio»
// y subida reanudable por trozos, directo del navegador a Drive. Todo recibe `fetch`
// inyectado para poder probarlo. El token nunca se guarda ni aparece en mensajes de error.

export const TROZO = 8 * 1024 * 1024; // 8 MiB: múltiplo de 256 KiB, como pide Google

const API = "https://www.googleapis.com/drive/v3/files";
const SUBIDA = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink";
const CARPETA = "InnovationTECH Studio";
const TIPO_CARPETA = "application/vnd.google-apps.folder";
const ESPERA_REINTENTO = 1500;

export type CodigoDrive = "TOKEN" | "LLENO" | "PERMISO" | "RED" | "OTRO";

const MENSAJES: Record<CodigoDrive, string> = {
  TOKEN: "Tu sesión de Google venció. Vuelve a intentarlo.",
  LLENO: "Tu Google Drive está lleno. Libera espacio y vuelve a intentarlo.",
  PERMISO: "Google no dio permiso para guardar en tu Drive.",
  RED: "Se perdió la conexión al subir a Drive. Vuelve a intentarlo.",
  OTRO: "No se pudo guardar en Google Drive.",
};

export class ErrorDrive extends Error {
  codigo: CodigoDrive;
  constructor(codigo: CodigoDrive) {
    super(MENSAJES[codigo]);
    this.name = "ErrorDrive";
    this.codigo = codigo;
  }
}

export function errorDrive(status: number, cuerpo: string): ErrorDrive {
  if (status === 401) return new ErrorDrive("TOKEN");
  if (status === 403) {
    let razones: string[] = [];
    try {
      const datos = JSON.parse(cuerpo) as { error?: { errors?: { reason?: string }[] } };
      razones = (datos.error?.errors ?? []).map((e) => e.reason ?? "");
    } catch {
      razones = cuerpo.includes("storageQuotaExceeded") ? ["storageQuotaExceeded"] : [];
    }
    return new ErrorDrive(razones.includes("storageQuotaExceeded") ? "LLENO" : "PERMISO");
  }
  return new ErrorDrive("OTRO");
}

const esAbort = (e: unknown) => e instanceof Error && e.name === "AbortError";

// Llama a fetch; un fallo de red (que no sea cancelar) se vuelve ErrorDrive RED.
async function pedir(f: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await f(url, init);
  } catch (e) {
    if (esAbort(e)) throw e;
    throw new ErrorDrive("RED");
  }
}

async function fallo(r: Response): Promise<ErrorDrive> {
  return errorDrive(r.status, await r.text().catch(() => ""));
}

const autorizacion = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Devuelve el id de la carpeta «InnovationTECH Studio»: la guardada si sigue viva, la que exista o una nueva. */
export async function carpetaDrive(token: string, f: typeof fetch, guardada?: string | null): Promise<string> {
  if (guardada) {
    const r = await pedir(f, `${API}/${encodeURIComponent(guardada)}?fields=id,trashed`, { headers: autorizacion(token) });
    if (r.ok) {
      const d = (await r.json()) as { id?: string; trashed?: boolean };
      if (d.id && !d.trashed) return d.id;
    } else if (r.status === 401) {
      throw new ErrorDrive("TOKEN");
    }
    // Borrada, en la papelera o sin acceso: se busca o se crea otra.
  }

  const q = `name='${CARPETA}' and mimeType='${TIPO_CARPETA}' and trashed=false`;
  const busqueda = new URLSearchParams({ q, fields: "files(id)" });
  const rb = await pedir(f, `${API}?${busqueda}`, { headers: autorizacion(token) });
  if (!rb.ok) throw await fallo(rb);
  const encontradas = (await rb.json()) as { files?: { id: string }[] };
  const primera = encontradas.files?.[0]?.id;
  if (primera) return primera;

  const rc = await pedir(f, `${API}?fields=id`, {
    method: "POST",
    headers: { ...autorizacion(token), "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ name: CARPETA, mimeType: TIPO_CARPETA }),
  });
  if (!rc.ok) throw await fallo(rc);
  const creada = (await rc.json()) as { id?: string };
  if (!creada.id) throw new ErrorDrive("OTRO");
  return creada.id;
}

/** Abre una sesión de subida reanudable y devuelve su dirección (encabezado Location). */
export async function iniciarSubida(
  token: string,
  datos: { nombre: string; tipo: string; tamano: number; carpeta: string },
  f: typeof fetch,
): Promise<string> {
  const r = await pedir(f, SUBIDA, {
    method: "POST",
    headers: {
      ...autorizacion(token),
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": datos.tipo,
      "X-Upload-Content-Length": String(datos.tamano),
    },
    body: JSON.stringify({ name: datos.nombre, parents: [datos.carpeta] }),
  });
  if (!r.ok) throw await fallo(r);
  const url = r.headers.get("Location");
  if (!url) throw new ErrorDrive("OTRO");
  return url;
}

// «bytes=0-4194303» → 4194304 (siguiente byte que falta). Sin Range → 0.
function siguienteDesdeRange(r: Response): number {
  const m = /bytes=\d+-(\d+)/.exec(r.headers.get("Range") ?? "");
  return m ? Number(m[1]) + 1 : 0;
}

type Subido = { id: string; webViewLink: string };

async function terminado(r: Response): Promise<Subido> {
  const d = (await r.json()) as Partial<Subido>;
  if (!d.id) throw new ErrorDrive("OTRO");
  return { id: d.id, webViewLink: d.webViewLink ?? "" };
}

const esperarMs = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

function revisarCancelado(senal?: AbortSignal) {
  if (senal?.aborted) throw Object.assign(new Error("Subida cancelada"), { name: "AbortError" });
}

/**
 * Sube el archivo por trozos (`blob.slice`, nunca el archivo entero en memoria).
 * Ante un corte de red o un 5xx: espera 1.5 s, pregunta a Drive hasta dónde llegó y sigue
 * desde ahí. Si vuelve a fallar en el mismo punto → ErrorDrive RED.
 */
export async function subirTrozos(
  url: string,
  blob: Blob,
  op: {
    f: typeof fetch;
    alProgreso?: (pct: number) => void;
    senal?: AbortSignal;
    trozo?: number;
    esperar?: (ms: number) => Promise<void>;
  },
): Promise<Subido> {
  const total = blob.size;
  const trozo = op.trozo ?? TROZO;
  const esperar = op.esperar ?? esperarMs;
  const avisar = (n: number) => op.alProgreso?.(total ? Math.min(100, Math.floor((n * 100) / total)) : 0);
  let inicio = 0;
  let falloEn = -1; // inicio donde ocurrió el último fallo; -1 = ninguno

  avisar(0);
  for (;;) {
    revisarCancelado(op.senal);
    const fin = Math.min(inicio + trozo, total);
    let r: Response | null = null;
    try {
      r = await op.f(url, {
        method: "PUT",
        headers: { "Content-Range": total ? `bytes ${inicio}-${fin - 1}/${total}` : "bytes */0" },
        body: blob.slice(inicio, fin),
        signal: op.senal,
      });
    } catch (e) {
      if (esAbort(e)) throw e;
    }

    if (r && (r.status === 200 || r.status === 201)) {
      const hecho = await terminado(r);
      op.alProgreso?.(100);
      return hecho;
    }
    if (r && r.status === 308) {
      inicio = siguienteDesdeRange(r);
      avisar(inicio);
      continue;
    }
    if (r && r.status < 500) throw await fallo(r);

    // Corte de red o error 5xx.
    if (falloEn === inicio) throw new ErrorDrive("RED");
    falloEn = inicio;
    await esperar(ESPERA_REINTENTO);
    revisarCancelado(op.senal);
    let estado: Response | null = null;
    try {
      estado = await op.f(url, { method: "PUT", headers: { "Content-Range": `bytes */${total}` }, signal: op.senal });
    } catch (e) {
      if (esAbort(e)) throw e;
    }
    if (!estado || estado.status >= 500) continue; // se reintenta el mismo trozo
    if (estado.status === 200 || estado.status === 201) {
      const hecho = await terminado(estado);
      op.alProgreso?.(100);
      return hecho;
    }
    if (estado.status === 308) {
      inicio = siguienteDesdeRange(estado);
      avisar(inicio);
      continue;
    }
    throw await fallo(estado);
  }
}

export type Token = () => Promise<string>;

/** Carpeta → sesión de subida → trozos. Si el token venció, pide uno nuevo una sola vez y empieza de nuevo. */
export async function guardarEnDrive(
  blob: Blob,
  nombre: string,
  op: {
    token: Token;
    tokenNuevo: Token;
    f: typeof fetch;
    carpetaGuardada?: string | null;
    guardarCarpeta?: (id: string) => void;
    alProgreso?: (pct: number) => void;
    senal?: AbortSignal;
    esperar?: (ms: number) => Promise<void>;
  },
): Promise<Subido> {
  let token = await op.token();
  let guardada = op.carpetaGuardada ?? null;
  let renovado = false;
  for (;;) {
    try {
      revisarCancelado(op.senal);
      const carpeta = await carpetaDrive(token, op.f, guardada);
      if (carpeta !== guardada) op.guardarCarpeta?.(carpeta);
      guardada = carpeta;
      const url = await iniciarSubida(
        token,
        { nombre, tipo: blob.type || "application/octet-stream", tamano: blob.size, carpeta },
        op.f,
      );
      return await subirTrozos(url, blob, { f: op.f, alProgreso: op.alProgreso, senal: op.senal, esperar: op.esperar });
    } catch (e) {
      if (e instanceof ErrorDrive && e.codigo === "TOKEN" && !renovado) {
        renovado = true;
        token = await op.tokenNuevo();
        continue;
      }
      throw e;
    }
  }
}
