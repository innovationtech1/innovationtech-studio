import { createPrediction, getPrediction, jsonError, outputUrls } from "@/lib/replicate";

export const maxDuration = 60;

// Genera imágenes con el modelo que el usuario elija en Replicate.
export async function POST(req: Request) {
  const token = req.headers.get("x-replicate-key");
  if (!token) return jsonError("Falta tu clave de Replicate. Agrégala en Configuración.", 401);

  const { prompt, aspectRatio, count, model } = await req.json().catch(() => ({}));
  if (!prompt) return jsonError("Describe la imagen que quieres.");

  try {
    let p = await createPrediction(
      token,
      model || "black-forest-labs/flux-schnell",
      {
        prompt,
        aspect_ratio: aspectRatio || "1:1",
        num_outputs: Math.min(Math.max(Number(count) || 1, 1), 4),
        output_format: "png",
      },
      true
    );
    // Si aún no termina, esperamos un poco más.
    const start = Date.now();
    while (!["succeeded", "failed", "canceled"].includes(p.status) && Date.now() - start < 45000) {
      await new Promise((r) => setTimeout(r, 2000));
      p = await getPrediction(token, p.id);
    }
    if (p.status !== "succeeded") return jsonError(p.error || "La imagen no se pudo generar.", 502);
    return Response.json({ urls: outputUrls(p.output) });
  } catch (e) {
    return jsonError((e as Error).message, 502);
  }
}
