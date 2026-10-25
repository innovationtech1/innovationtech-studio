import { createPrediction, getPrediction, jsonError, outputUrls, Prediction } from "@/lib/replicate";
import { cloudflareImage, isFlagged } from "@/lib/cloudflare";

export const maxDuration = 60;

// Genera imágenes con Cloudflare Workers AI (gratis) o con Replicate (de pago).
// Si el usuario subió imágenes, se usan como referencia.
export async function POST(req: Request) {
  const { prompt, aspectRatio, count, model, refModel, editModel, provider, references } = await req
    .json()
    .catch(() => ({}));
  if (!prompt) return jsonError("Describe la imagen que quieres.");
  const n = Math.min(Math.max(Number(count) || 1, 1), 4);
  const refs: string[] = Array.isArray(references)
    ? references.filter((r: unknown) => typeof r === "string" && r.startsWith("data:image/")).slice(0, 4)
    : [];

  if (provider === "cloudflare") {
    const accountId = req.headers.get("x-cf-account");
    const token = req.headers.get("x-cf-token");
    if (!accountId || !token) {
      return jsonError("Faltan tu Account ID o tu token de Cloudflare. Agrégalos en Configuración.", 401);
    }
    try {
      // Si una imagen se bloquea, entregamos las demás en vez de fallar todo.
      const results = await Promise.allSettled(
        Array.from({ length: n }, () =>
          cloudflareImage({
            accountId,
            token,
            model: model || "@cf/black-forest-labs/flux-1-schnell",
            refModel: refModel || "@cf/black-forest-labs/flux-2-klein-4b",
            prompt,
            aspectRatio: aspectRatio || "1:1",
            references: refs,
          })
        )
      );
      const urls = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const errors = results.flatMap((r) => (r.status === "rejected" ? [(r.reason as Error).message] : []));
      if (urls.length) {
        const flagged = errors.filter(isFlagged).length;
        return Response.json({
          urls,
          warning: flagged
            ? `${flagged} de ${n} imágenes fueron bloqueadas por el filtro de seguridad de Cloudflare y no se incluyeron.`
            : errors.length
              ? `${errors.length} de ${n} imágenes no se pudieron generar.`
              : undefined,
        });
      }
      const msg = errors[0] || "No se pudo generar la imagen.";
      return Response.json({ error: msg, flagged: isFlagged(msg) }, { status: isFlagged(msg) ? 422 : 502 });
    } catch (e) {
      return jsonError((e as Error).message, 502);
    }
  }

  const token = req.headers.get("x-replicate-key");
  if (!token) return jsonError("Falta tu clave de Replicate. Agrégala en Configuración.", 401);

  const finish = async (p: Prediction) => {
    const start = Date.now();
    while (!["succeeded", "failed", "canceled"].includes(p.status) && Date.now() - start < 45000) {
      await new Promise((r) => setTimeout(r, 2000));
      p = await getPrediction(token, p.id);
    }
    if (p.status !== "succeeded") throw new Error(p.error || "La imagen no se pudo generar.");
    return outputUrls(p.output);
  };

  try {
    if (refs.length > 0) {
      // Modelo de edición: usa la primera imagen subida como base.
      const results = await Promise.all(
        Array.from({ length: n }, async () =>
          finish(
            await createPrediction(
              token,
              editModel || "black-forest-labs/flux-kontext-pro",
              {
                prompt,
                input_image: refs[0],
                aspect_ratio: aspectRatio && aspectRatio !== "1:1" ? aspectRatio : "match_input_image",
                output_format: "png",
              },
              true
            )
          )
        )
      );
      return Response.json({ urls: results.flat() });
    }

    const urls = await finish(
      await createPrediction(
        token,
        model || "black-forest-labs/flux-schnell",
        { prompt, aspect_ratio: aspectRatio || "1:1", num_outputs: n, output_format: "png" },
        true
      )
    );
    return Response.json({ urls });
  } catch (e) {
    return jsonError((e as Error).message, 502);
  }
}
