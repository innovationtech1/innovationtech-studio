import { getPrediction, jsonError, outputUrls } from "@/lib/replicate";
import { jsonAcceso, requireAccess } from "@/lib/account";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await requireAccess(req, { herramienta: "video_ia", clavePropia: !!req.headers.get("x-replicate-key") });
  if (!acceso.ok) return jsonAcceso(acceso);

  const token = req.headers.get("x-replicate-key");
  if (!token) return jsonError("Falta tu clave de Replicate.", 401);
  const { id } = await params;
  try {
    const p = await getPrediction(token, id);
    return Response.json({
      status: p.status,
      error: p.error || null,
      urls: p.status === "succeeded" ? outputUrls(p.output) : [],
    });
  } catch (e) {
    return jsonError((e as Error).message, 502);
  }
}
