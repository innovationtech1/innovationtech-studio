import "server-only";
import { createHash, createHmac } from "node:crypto";
import { firestoreStore, type AccountStore } from "./account-store";
import { stripeModoLive } from "./stripe-server";
import { estadoEfectivo, type Negocio, type Plan } from "./plans";

// Cloudflare R2 (API de S3): fotos y clips de los videos con IA. Todo privado; se entra con
// enlaces firmados (SigV4) que duran poco. Sin dependencias: la firma se hace con node:crypto.

export type ConfigR2 = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

export function configR2(env: Record<string, string | undefined> = process.env): ConfigR2 | null {
  const v = (k: string) => (env[k] ?? "").trim();
  const cfg = {
    accountId: v("R2_ACCOUNT_ID"),
    accessKeyId: v("R2_ACCESS_KEY_ID"),
    secretAccessKey: v("R2_SECRET_ACCESS_KEY"),
    bucket: v("R2_BUCKET"),
  };
  return cfg.accountId && cfg.accessKeyId && cfg.secretAccessKey && cfg.bucket ? cfg : null;
}

// Codificación de AWS: todo menos letras, números y - _ . ~
const codificar = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (llave: Buffer | string, dato: string) => createHmac("sha256", llave).update(dato, "utf8").digest();
const sha256hex = (dato: string) => createHash("sha256").update(dato, "utf8").digest("hex");

export type Prefirma = {
  metodo: "GET" | "PUT";
  host: string;
  ruta: string; // ya codificada, empieza con /
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  segundos: number;
  ahora?: Date;
  // Encabezados que quedan firmados además de host (el que use el enlace debe mandarlos iguales)
  encabezados?: Record<string, string>;
};

// Enlace prefirmado SigV4 (firma en la consulta, contenido sin firmar).
export function prefirmar(p: Prefirma): string {
  const fecha = (p.ahora ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // 20130524T000000Z
  const dia = fecha.slice(0, 8);
  const alcance = `${dia}/${p.region}/s3/aws4_request`;
  const encabezados: Record<string, string> = { host: p.host };
  for (const [k, v] of Object.entries(p.encabezados ?? {})) encabezados[k.toLowerCase()] = v.trim();
  const nombres = Object.keys(encabezados).sort();
  const consulta: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${p.accessKeyId}/${alcance}`],
    ["X-Amz-Date", fecha],
    ["X-Amz-Expires", String(p.segundos)],
    ["X-Amz-SignedHeaders", nombres.join(";")],
  ];
  const consultaTexto = consulta.map(([k, v]) => `${codificar(k)}=${codificar(v)}`).join("&");
  const canonica = [
    p.metodo,
    p.ruta,
    consultaTexto,
    ...nombres.map((n) => `${n}:${encabezados[n]}`),
    "",
    nombres.join(";"),
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const paraFirmar = ["AWS4-HMAC-SHA256", fecha, alcance, sha256hex(canonica)].join("\n");
  const llave = hmac(hmac(hmac(hmac(`AWS4${p.secretAccessKey}`, dia), p.region), "s3"), "aws4_request");
  const firma = createHmac("sha256", llave).update(paraFirmar, "utf8").digest("hex");
  return `https://${p.host}${p.ruta}?${consultaTexto}&X-Amz-Signature=${firma}`;
}

export type OpcionesFirma = { tipo?: string; bytes?: number; ahora?: Date; cfg?: ConfigR2 | null };

// Enlace temporal para leer (GET) o subir (PUT) un archivo de R2. En PUT, el tipo y el tamaño
// quedan firmados: con ese enlace no se puede subir otra cosa.
export function firmarUrl(metodo: "GET" | "PUT", llave: string, segundos: number, opts: OpcionesFirma = {}): string {
  const cfg = opts.cfg === undefined ? configR2() : opts.cfg;
  if (!cfg) throw new Error("R2 sin configurar");
  const encabezados: Record<string, string> = {};
  if (metodo === "PUT" && opts.tipo) encabezados["content-type"] = opts.tipo;
  if (metodo === "PUT" && opts.bytes !== undefined) encabezados["content-length"] = String(opts.bytes);
  return prefirmar({
    metodo,
    host: `${cfg.accountId}.r2.cloudflarestorage.com`,
    ruta: `/${codificar(cfg.bucket)}/${llave.split("/").map(codificar).join("/")}`,
    region: "auto",
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    segundos,
    ahora: opts.ahora,
    encabezados,
  });
}

const MAX_CLIP = 100 * 1024 * 1024;

// Descarga un archivo (el clip que entrega fal.ai) y lo guarda en R2.
export async function subirDesdeUrl(
  origen: string,
  llave: string,
  tipo: string,
  f: typeof fetch = fetch,
  cfg?: ConfigR2 | null,
): Promise<void> {
  if (!/^https:\/\//i.test(origen)) throw new Error("El origen del clip no es https");
  const bajada = await f(origen);
  if (!bajada.ok) throw new Error(`No se pudo descargar el clip (${bajada.status})`);
  const datos = new Uint8Array(await bajada.arrayBuffer());
  if (datos.byteLength === 0 || datos.byteLength > MAX_CLIP) throw new Error("El clip está vacío o es demasiado grande");
  const url = firmarUrl("PUT", llave, 300, { tipo, bytes: datos.byteLength, cfg });
  const subida = await f(url, { method: "PUT", headers: { "Content-Type": tipo }, body: datos });
  if (!subida.ok) throw new Error(`No se pudo guardar el clip en R2 (${subida.status})`);
}

export type Falla = { ok: false; status: number; error: string };
const falla = (status: number, error: string): Falla => ({ ok: false, status, error });

export const SIN_ALMACEN = "Falta configurar el almacenamiento de videos. Avísale a InnovationTECH.";
const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_FOTO = 8 * 1024 * 1024;
const SEGUNDOS_SUBIDA = 300;

// Carpeta de las fotos de un negocio. Las de la prueba gratis van bajo demo/ (R2 las borra a los 30 días).
export function carpetaFotos(negocioId: string, plan: Plan): string {
  return `${plan === "prueba" ? "demo/" : ""}negocios/${negocioId}/fotos/`;
}
export function llaveClip(negocioId: string, plan: Plan, trabajoId: string): string {
  return `${plan === "prueba" ? "demo/" : ""}negocios/${negocioId}/clips/${trabajoId}.mp4`;
}

export type DepsR2 = { store?: AccountStore; now?: number; cfg?: ConfigR2 | null; stripeLive?: boolean };

// El negocio de quien tiene la sesión, si puede usar Studio ahora (plan activo o prueba vigente).
export async function negocioActivo(
  uid: string,
  deps: DepsR2 = {},
): Promise<{ ok: true; negocio: Negocio; plan: Plan } | Falla> {
  if (!uid) return falla(401, "Inicia sesión para continuar.");
  const store = deps.store ?? firestoreStore();
  const usuario = await store.getUsuario(uid);
  const negocio = usuario ? await store.getNegocio(usuario.negocioId) : null;
  if (!negocio) return falla(403, "Crea tu cuenta para empezar.");
  const ef = estadoEfectivo(negocio, deps.now ?? Date.now(), { stripeLive: deps.stripeLive ?? stripeModoLive() });
  if ((ef.estado !== "activo" && ef.estado !== "prueba") || !ef.plan) {
    return falla(403, "Tu cuenta no está activa. Elige un plan para seguir creando.");
  }
  if (negocio.duenoUid !== uid && ef.plan !== "pro") return falla(403, "Tu plan actual es para 1 persona. Pide al dueño que pase a Pro.");
  return { ok: true, negocio, plan: ef.plan };
}

// Enlace para que el navegador suba una foto directo a R2 (5 minutos, solo imagen, máx. 8 MB).
export async function pedirSubida(
  uid: string,
  datos: { tipo: unknown; bytes: unknown; sha256: unknown },
  deps: DepsR2 = {},
): Promise<{ ok: true; url: string; imagenKey: string } | Falla> {
  const quien = await negocioActivo(uid, deps);
  if (!quien.ok) return quien;
  const ext = typeof datos.tipo === "string" ? EXTENSION[datos.tipo] : undefined;
  if (!ext) return falla(400, "La foto debe ser JPG, PNG o WebP.");
  const bytes = datos.bytes;
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 1 || bytes > MAX_FOTO) {
    return falla(400, "La foto pesa demasiado. El máximo es 8 MB.");
  }
  if (typeof datos.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(datos.sha256)) return falla(400, "No se pudo preparar la foto. Intenta de nuevo.");
  const cfg = deps.cfg === undefined ? configR2() : deps.cfg;
  if (!cfg) return falla(503, SIN_ALMACEN);
  const imagenKey = `${carpetaFotos(quien.negocio.id, quien.plan)}${datos.sha256}.${ext}`;
  const url = firmarUrl("PUT", imagenKey, SEGUNDOS_SUBIDA, {
    tipo: datos.tipo as string,
    bytes,
    cfg,
    ahora: new Date(deps.now ?? Date.now()),
  });
  return { ok: true, url, imagenKey };
}
