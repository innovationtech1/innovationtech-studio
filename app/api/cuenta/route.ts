import { crearCuenta, obtenerCuenta } from "@/lib/account-api";
import { cuerpoJson, errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";

export const dynamic = "force-dynamic";

// Estado de la cuenta de quien tiene la sesión abierta.
export async function GET(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  return json(await obtenerCuenta(s.uid, s.email, s.emailVerified));
}

// Crea el negocio (o une a la persona a un equipo si la invitaron).
export async function POST(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const { nombre } = await cuerpoJson(req);
  const r = await crearCuenta(s.uid, s.email, s.emailVerified, typeof nombre === "string" ? nombre : "");
  if (!r.ok) return errorJson(r);
  return json(await obtenerCuenta(s.uid, s.email, s.emailVerified));
}
