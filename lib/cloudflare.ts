// Generación de imágenes con Cloudflare Workers AI (plan gratuito diario).
// La clave y el Account ID llegan en cada petición y no se guardan en el servidor.

export async function cloudflareImage(
  accountId: string,
  token: string,
  model: string,
  prompt: string
): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;
  const body: Record<string, unknown> = {
    prompt: prompt.slice(0, 2048),
    seed: Math.floor(Math.random() * 2_000_000_000),
  };
  if (model.includes("flux-1-schnell")) body.steps = 4;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const type = res.headers.get("content-type") || "";

  // Algunos modelos devuelven la imagen directamente en binario.
  if (res.ok && type.startsWith("image/")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    const msg = data?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`;
    throw new Error(msg);
  }
  const image = data?.result?.image;
  if (!image) throw new Error("Cloudflare no devolvió ninguna imagen.");
  return image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
}
