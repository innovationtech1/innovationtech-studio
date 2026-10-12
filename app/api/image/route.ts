import { createPrediction, getPrediction, jsonError, outputUrls } from "@/lib/replicate";
import { cloudflareImage } from "@/lib/cloudflare";

export const maxDuration = 60;

// Genera imágenes con Cloudflare Workers AI (gratis) o con Replicate (de pago).
export async function POST(req: Request) {
  const { prompt, aspectRatio, count, model, provider } = await req.json().catch(() => ({}));
  if (!prompt) return jsonError("Describe la imagen que quieres.");
  const n = Math.min(Math.max(Number(count) || 1, 1), 4);

  if (provider === "cloudflare") {
    const accountId = req.headers.get("x-cf-account");
    const token = req.headers.get("x-cf-token");
    if (!accountId || !token) {
      return jsonError("Faltan tu Account ID o tu token de Cloudflare. Agrégalos en Configuración.", 401);
    }
    try {
      const urls = await Promise.all(
        Array.from({ length: n }, () =>
          cloudflareImage(accountId, token, model || "@cf/black-forest-labs/flux-1-schnell", prompt)
        )
      );
      return Response.json({ urls });
    } catch (e) {
      return jsonError((e as Error).message, 502);
    }
  }

  const token = req.headers.get("x-replicate-key");
  if (!token) return jsonError("Falta tu clave de Replicate. Agrégala en Configuración.", 401);

  try {
    let p = await createPrediction(
      token,
      model || "black-forest-labs/flux-schnell",
      { prompt, aspect_ratio: aspectRatio || "1:1", num_outputs: n, output_format: "png" },
      true
    );
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
