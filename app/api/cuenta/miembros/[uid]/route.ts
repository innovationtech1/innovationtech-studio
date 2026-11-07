import { quitarMiembro } from "@/lib/account-api";
import { errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ uid: string }> }) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const { uid } = await ctx.params;
  const r = await quitarMiembro(s.uid, uid);
  return r.ok ? json({ ok: true }) : errorJson(r);
}
