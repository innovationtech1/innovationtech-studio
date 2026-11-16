// Cliente de Google Drive (solo lógica, sin pantalla): carpeta «InnovationTECH Studio»
// y subida reanudable por trozos, directo del navegador a Drive. Todo recibe `fetch`
// inyectado para poder probarlo. El token nunca se guarda ni aparece en mensajes de error.

export const TROZO = 8 * 1024 * 1024; // 8 MiB: múltiplo de 256 KiB, como pide Google

const API = "https://www.googleapis.com/drive/v3/files";
const SUBIDA = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink";
const CARPETA = "InnovationTECH Studio";
const TIPO_CARPETA = "application/vnd.google-apps.folder";
const ESPERA_REINTENTO = 1500;

export type CodigoDrive = "TOKEN" | "LLENO" | "PERMISO" | "OCUPADO" | "RED" | "OTRO";

const MENSAJES: Record<CodigoDrive, string> = {
  TOKEN: "Tu sesión de Google venció. Vuelve a intentarlo.",
  LLENO: "Tu Google Drive está lleno. Libera espacio y vuelve a intentarlo.",
  PERMISO: "Google no dio permiso para guardar en tu Drive.",
  OCUPADO: "Google Drive está ocupado. Espera un momento y vuelve a intentarlo.",
  RED: "Se perdió la conexión al subir a Drive. Vuelve a intentarlo.",
  OTRO: "No se pudo guardar en Google Drive.",
};

export class ErrorDrive extends Error {
  codigo: CodigoDrive;
  /** Código HTTP que lo causó, si vino de una respuesta (p. ej. 404 = sesión de subida vencida). */
  estado?: number;
  constructor(codigo: CodigoDrive, estado?: number) {
    super(MENSAJES[codigo]);
    this.name = "ErrorDrive";
    this.codigo = codigo;
    this.estado = estado;
  }
}

export function errorDrive(status: number, cuerpo: string): ErrorDrive {
  if (status === 401) return new ErrorDrive("TOKEN", status);
  if (status === 429) return new ErrorDrive("OCUPADO", status);
  if (status === 403) {
    let razones: string[] = [];
    try {
      const datos = JSON.parse(cuerpo) as { error?: { errors?: { reason?: string }[] } };
      razones = (datos.error?.errors ?? []).map((e) => e.reason ?? "");
    } catch {
      razones = ["storageQuotaExceeded", "userRateLimitExceeded", "rateLimitExceeded"].filter((r) => cuerpo.includes(r));
    }
    if (razones.includes("storageQuotaExceeded")) return new ErrorDrive("LLENO", status);
    if (razones.includes("userRateLimitExceeded") || razones.includes("rateLimitExceeded")) {
      return new ErrorDrive("OCUPADO", status);
    }
    return new ErrorDrive("PERMISO", status);
  }
  return new ErrorDrive("OTRO", status);
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
export async function carpetaDrive(
  token: string,
  f: typeof fetch,
  guardada?: string | null,
  senal?: AbortSignal,
): Promise<string> {
  if (guardada) {
    const r = await pedir(f, `${API}/${encodeURIComponent(guardada)}?fields=id,trashed`, {
      headers: autorizacion(token),
      signal: senal,
    });
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
  const rb = await pedir(f, `${API}?${busqueda}`, { headers: autorizacion(token), signal: senal });
  if (!rb.ok) throw await fallo(rb);
  const encontradas = (await rb.json()) as { files?: { id: string }[] };
  const primera = encontradas.files?.[0]?.id;
  if (primera) return primera;

  const rc = await pedir(f, `${API}?fields=id`, {
    method: "POST",
    headers: { ...autorizacion(token), "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ name: CARPETA, mimeType: TIPO_CARPETA }),
    signal: senal,
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
  senal?: AbortSignal,
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
    signal: senal,
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

const errorCancelado = () => Object.assign(new Error("Subida cancelada"), { name: "AbortError" });

function revisarCancelado(senal?: AbortSignal) {
  if (senal?.aborted) throw errorCancelado();
}

// Espera `ms`, pero si se cancela mientras tanto, termina de inmediato con AbortError.
function esperarCancelable(esperar: (ms: number) => Promise<void>, ms: number, senal?: AbortSignal): Promise<void> {
  revisarCancelado(senal);
  if (!senal) return esperar(ms);
  return new Promise<void>((res, rej) => {
    const alCancelar = () => rej(errorCancelado());
    senal.addEventListener("abort", alCancelar, { once: true });
    esperar(ms).then(
      () => {
        senal.removeEventListener("abort", alCancelar);
        res();
      },
      (e) => {
        senal.removeEventListener("abort", alCancelar);
        rej(e);
      },
    );
  });
}

const MAX_SIN_AVANCE = 3;

/**
 * Sube el archivo por trozos (`blob.slice`, nunca el archivo entero en memoria).
 * Ante un corte de red o un 5xx: espera 1.5 s, pregunta a Drive hasta dónde llegó y sigue
 * desde ahí. Si vuelve a fallar en el mismo punto → ErrorDrive RED. Si Drive responde 3 veces
 * seguidas sin avanzar → RED (nunca se queda dando vueltas).
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
  let sinAvance = 0; // respuestas 308 seguidas que no movieron `inicio`

  const pedirPut = async (headers: Record<string, string>, body?: Blob): Promise<Response | null> => {
    try {
      return await op.f(url, { method: "PUT", headers, body, signal: op.senal });
    } catch (e) {
      if (esAbort(e)) throw e;
      return null; // corte de red
    }
  };
  // Pregunta a Drive hasta dónde llegó (PUT vacío). También cierra la subida de un archivo de 0 bytes.
  const consultarEstado = () => pedirPut({ "Content-Range": `bytes */${total}` });
  const listo = async (r: Response) => {
    const hecho = await terminado(r);
    op.alProgreso?.(100);
    return hecho;
  };
  const avanzar = (r: Response) => {
    const nuevo = siguienteDesdeRange(r);
    if (nuevo > inicio) sinAvance = 0;
    else if (++sinAvance >= MAX_SIN_AVANCE) throw new ErrorDrive("RED");
    inicio = nuevo;
    avisar(Math.min(inicio, total));
  };
  const esFin = (r: Response) => r.status === 200 || r.status === 201;

  avisar(0);
  for (;;) {
    revisarCancelado(op.senal);

    // Drive ya confirmó todos los bytes (o el archivo está vacío): solo falta que diga «terminado».
    if (inicio >= total) {
      const r = await consultarEstado();
      if (r && esFin(r)) return listo(r);
      if (r && r.status !== 308 && r.status < 500) throw await fallo(r);
      throw new ErrorDrive("RED");
    }

    const fin = Math.min(inicio + trozo, total);
    const r = await pedirPut({ "Content-Range": `bytes ${inicio}-${fin - 1}/${total}` }, blob.slice(inicio, fin));
    if (r && esFin(r)) return listo(r);
    if (r && r.status === 308) {
      avanzar(r);
      continue;
    }
    if (r && r.status < 500) throw await fallo(r);

    // Corte de red o error 5xx.
    if (falloEn === inicio) throw new ErrorDrive("RED");
    falloEn = inicio;
    await esperarCancelable(esperar, ESPERA_REINTENTO, op.senal);
    const estado = await consultarEstado();
    if (!estado || estado.status >= 500) continue; // se reintenta el mismo trozo
    if (esFin(estado)) return listo(estado);
    if (estado.status === 308) {
      avanzar(estado);
      continue;
    }
    throw await fallo(estado);
  }
}

export type Token = () => Promise<string>;

/**
 * Carpeta → sesión de subida → trozos. Si el token venció, pide uno nuevo una sola vez y empieza de nuevo.
 * Si la sesión de subida venció (404), abre otra una sola vez.
 */
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
  revisarCancelado(op.senal);
  let token = await op.token();
  let guardada = op.carpetaGuardada ?? null;
  let renovado = false;
  let reabierta = false;
  for (;;) {
    try {
      revisarCancelado(op.senal);
      const carpeta = await carpetaDrive(token, op.f, guardada, op.senal);
      if (carpeta !== guardada) op.guardarCarpeta?.(carpeta);
      guardada = carpeta;
      for (;;) {
        const url = await iniciarSubida(
          token,
          { nombre, tipo: blob.type || "application/octet-stream", tamano: blob.size, carpeta },
          op.f,
          op.senal,
        );
        try {
          return await subirTrozos(url, blob, { f: op.f, alProgreso: op.alProgreso, senal: op.senal, esperar: op.esperar });
        } catch (e) {
          // 404 en un trozo = la sesión de subida venció: se abre otra una sola vez.
          if (e instanceof ErrorDrive && e.estado === 404 && !reabierta) {
            reabierta = true;
            continue;
          }
          throw e;
        }
      }
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
