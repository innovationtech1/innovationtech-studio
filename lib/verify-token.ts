import "server-only";
import { createPublicKey, createVerify } from "node:crypto";

// Verifica el token de sesión (ID token) de Firebase Auth con node:crypto, sin librerías
// externas (la librería "jose" dio error ERR_REQUIRE_ESM en Netlify). Sigue los pasos de:
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

const URL_LLAVES =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const MARGEN_S = 60; // tolerancia por diferencias de reloj

export type SesionVerificada = { uid: string; email: string; emailVerified: boolean };

export type OpcionesVerificar = {
  projectId?: string;
  getCerts?: () => Promise<Record<string, string>>;
  now?: number; // milisegundos
};

let llaves: Record<string, string> | null = null;
let llavesVencen = 0;

// Descarga los certificados de Google y los guarda según el Cache-Control: max-age
async function llavesDeGoogle(): Promise<Record<string, string>> {
  if (llaves && Date.now() < llavesVencen) return llaves;
  const r = await fetch(URL_LLAVES, { signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`No se pudieron leer las llaves de Google (${r.status})`);
  llaves = (await r.json()) as Record<string, string>;
  const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get("cache-control") || "")?.[1] || 3600);
  llavesVencen = Date.now() + maxAge * 1000;
  return llaves;
}

function decodificar(parte: string): Record<string, unknown> {
  try {
    const v = JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));
    if (v && typeof v === "object") return v as Record<string, unknown>;
  } catch {
    /* cae al error de abajo */
  }
  throw new Error("Token con formato inválido");
}

// Devuelve { uid, email, emailVerified } o lanza un error en español si el token no es válido
export async function verifyIdToken(
  token: string,
  opts: OpcionesVerificar = {},
): Promise<SesionVerificada> {
  const proyecto = opts.projectId ?? process.env.FIREBASE_PROJECT_ID;
  if (!proyecto) throw new Error("Falta FIREBASE_PROJECT_ID");
  const ahora = Math.floor((opts.now ?? Date.now()) / 1000);

  const partes = String(token).split(".");
  if (partes.length !== 3) throw new Error("Token con formato inválido");
  const encabezado = decodificar(partes[0]);
  const datos = decodificar(partes[1]);
  if (encabezado.alg !== "RS256") throw new Error("Algoritmo no permitido");

  const certs = await (opts.getCerts ?? llavesDeGoogle)();
  const kid = typeof encabezado.kid === "string" ? encabezado.kid : "";
  const certificado = Object.prototype.hasOwnProperty.call(certs, kid) ? certs[kid] : undefined;
  if (!certificado) throw new Error("Llave desconocida");

  let firmaOk = false;
  try {
    const verificador = createVerify("RSA-SHA256");
    verificador.update(`${partes[0]}.${partes[1]}`);
    firmaOk = verificador.verify(createPublicKey(certificado), Buffer.from(partes[2], "base64url"));
  } catch {
    firmaOk = false;
  }
  if (!firmaOk) throw new Error("Firma inválida");

  const { exp, iat, auth_time: authTime, aud, iss, sub } = datos;
  if (typeof exp !== "number" || !(exp > ahora - MARGEN_S)) throw new Error("Token vencido");
  if (typeof iat !== "number" || !(iat <= ahora + MARGEN_S)) throw new Error("Token con fecha futura");
  if (typeof authTime !== "number" || !(authTime <= ahora + MARGEN_S)) {
    throw new Error("Inicio de sesión con fecha futura");
  }
  if (aud !== proyecto) throw new Error("Token de otro proyecto");
  if (iss !== `https://securetoken.google.com/${proyecto}`) throw new Error("Emisor inválido");
  if (typeof sub !== "string" || !sub) throw new Error("Token sin usuario");

  return {
    uid: sub,
    email: typeof datos.email === "string" ? datos.email.toLowerCase() : "",
    emailVerified: datos.email_verified === true,
  };
}
