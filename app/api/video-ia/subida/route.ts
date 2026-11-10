import { cuentasActivas } from "@/lib/account";
import { cuerpoJson, errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";
import { pedirSubida } from "@/lib/r2";

export const dynamic = "force-dynamic";

// Enlace temporal para subir una foto a R2 (para una toma con IA).
export async function POST(req: Request) {
  if (!cuentasActivas()) return json({ error: "Los videos con IA necesitan una cuenta de Studio." }, 503);
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const { tipo, bytes, sha256 } = await cuerpoJson(req);
  const r = await pedirSubida(s.uid, { tipo, bytes, sha256 });
  return r.ok ? json({ url: r.url, imagenKey: r.imagenKey }) : errorJson(r);
}
