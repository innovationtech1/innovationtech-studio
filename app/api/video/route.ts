import { createPrediction, jsonError } from "@/lib/replicate";

// Inicia la generación de un video. Tarda varios minutos, así que
// devolvemos el id y la página consulta el estado en /api/video/[id].
export async function POST(req: Request) {
  const token = req.headers.get("x-replicate-key");
  if (!token) return jsonError("Falta tu clave de Replicate. Agrégala en Configuración.", 401);

  const { prompt, model, imageUrl } = await req.json().catch(() => ({}));
  if (!prompt) return jsonError("Describe el video que quieres.");

  const input: Record<string, unknown> = { prompt };
  if (imageUrl) input.first_frame_image = imageUrl;

  try {
    const p = await createPrediction(token, model || "minimax/video-01", input, false);
    return Response.json({ id: p.id, status: p.status });
  } catch (e) {
    return jsonError((e as Error).message, 502);
  }
}
