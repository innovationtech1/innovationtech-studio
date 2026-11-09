import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cifrado de la clave de Cloudflare del negocio (AES-256-GCM).
// La llave vive solo en STUDIO_CLAVES_SECRETO (base64 de exactamente 32 bytes), nunca en Firestore.

export type ClaveIA = { accountId: string; token: string };
export type Cifrado = { version: 1; iv: string; tag: string; datos: string };

let avisoLlaveMala = false;

// Lee la llave al momento de usarla (no al cargar el módulo). null si falta o no mide 32 bytes.
export function llaveDeEntorno(): Buffer | null {
  const v = (process.env.STUDIO_CLAVES_SECRETO ?? "").trim();
  if (!v) return null;
  const llave = Buffer.from(v, "base64");
  if (llave.length !== 32) {
    if (!avisoLlaveMala) {
      avisoLlaveMala = true;
      // Nunca se imprime el valor, solo el problema
      console.error("STUDIO_CLAVES_SECRETO no es válida: debe ser base64 de exactamente 32 bytes.");
    }
    return null;
  }
  return llave;
}

export function cifrarClave(c: ClaveIA, llave: Buffer): Cifrado {
  const iv = randomBytes(12); // nuevo en cada guardado
  const cifrador = createCipheriv("aes-256-gcm", llave, iv);
  const datos = Buffer.concat([cifrador.update(JSON.stringify({ accountId: c.accountId, token: c.token }), "utf8"), cifrador.final()]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cifrador.getAuthTag().toString("base64"),
    datos: datos.toString("base64"),
  };
}

// null ante cualquier error (llave distinta, datos alterados, documento mal formado).
export function descifrarClave(x: Cifrado, llave: Buffer): ClaveIA | null {
  try {
    if (!x || x.version !== 1) return null;
    const iv = Buffer.from(x.iv, "base64");
    const tag = Buffer.from(x.tag, "base64");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const d = createDecipheriv("aes-256-gcm", llave, iv);
    d.setAuthTag(tag);
    const texto = Buffer.concat([d.update(Buffer.from(x.datos, "base64")), d.final()]).toString("utf8");
    const o = JSON.parse(texto) as Partial<ClaveIA>;
    if (typeof o.accountId !== "string" || typeof o.token !== "string" || !o.accountId || !o.token) return null;
    return { accountId: o.accountId, token: o.token };
  } catch {
    return null;
  }
}
