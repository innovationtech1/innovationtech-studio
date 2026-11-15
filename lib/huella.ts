import { createHmac } from "node:crypto";

// Huella de un correo: sirve para saber «este correo ya usó su prueba gratis» sin guardar el correo.
// Sin el secreto no se puede saber a qué correo corresponde.

// El secreto: propio si se configuró; si no, la llave privada del servidor (siempre existe con cuentas).
export const secretoHuella = (env: Record<string, string | undefined> = process.env) =>
  env.STUDIO_HUELLA_SECRETO || env.FIREBASE_PRIVATE_KEY || "studio";

export function huellaCorreo(email: string, secreto: string = secretoHuella()): string {
  return createHmac("sha256", secreto).update(email.trim().toLowerCase(), "utf8").digest("hex");
}
