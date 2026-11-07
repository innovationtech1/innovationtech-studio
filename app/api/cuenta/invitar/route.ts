import { cancelarInvitacion, invitar } from "@/lib/account-api";
import { cuerpoJson, errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const { email } = await cuerpoJson(req);
  const r = await invitar(s.uid, typeof email === "string" ? email : "");
  return r.ok ? json({ ok: true, email: r.email }) : errorJson(r);
}

// Cancela una invitación pendiente (libera su lugar).
export async function DELETE(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const { email } = await cuerpoJson(req);
  const r = await cancelarInvitacion(s.uid, typeof email === "string" ? email : "");
  return r.ok ? json({ ok: true }) : errorJson(r);
}
