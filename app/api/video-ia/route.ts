import { cuerpoJson, errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";
import { baseDePedido, consultar, crearVideo } from "@/lib/video-ia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// El aviso de fal debe volver a esta misma versión del sitio.
const base = (req: Request) => baseDePedido(req);

// Crea las tomas con IA de un video (1 o 2 fotos). Responde con el id y estado de cada toma.
export async function POST(req: Request) {
  const { tomas } = await cuerpoJson(req);
  const r = await crearVideo(req, { tomas }, { base: base(req) });
  return r.ok ? json({ trabajos: r.trabajos }) : errorJson(r);
}

// Estado de las tomas: GET /api/video-ia?ids=a,b
export async function GET(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const r = await consultar(s.uid, ids, { base: base(req) });
  return r.ok ? json({ trabajos: r.trabajos, topeHoy: r.topeHoy }) : errorJson(r);
}
