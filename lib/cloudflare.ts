// Generación de imágenes con Cloudflare Workers AI (plan gratuito diario).
// La clave y el Account ID llegan en cada petición y no se guardan en el servidor.
//
// - FLUX.1 Schnell: solo texto, cuadrada. Rápido y económico.
// - FLUX.2 Klein: texto + hasta 4 imágenes de referencia, cualquier tamaño (256–1920 px).
//   Usa formulario multipart y cada imagen de referencia debe ser menor a 512×512.

const SIZES: Record<string, [number, number]> = {
  "1:1": [1024, 1024],
  "4:5": [896, 1120],
  "9:16": [768, 1344],
  "16:9": [1344, 768],
};

export type CfOptions = {
  accountId: string;
  token: string;
  model: string; // modelo de solo texto (cuadrado)
  refModel: string; // modelo con referencias y formatos
  prompt: string;
  aspectRatio: string;
  references: string[]; // data URLs
};

function dataUrlToBlob(dataUrl: string): Blob {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error("Una de las imágenes subidas no es válida.");
  return new Blob([Buffer.from(m[2], "base64")], { type: m[1] });
}

async function readImage(res: Response): Promise<string> {
  const type = res.headers.get("content-type") || "";
  if (res.ok && type.startsWith("image/")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`);
  }
  const image = data?.result?.image ?? data?.image;
  if (!image) throw new Error("Cloudflare no devolvió ninguna imagen.");
  return image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
}

export async function cloudflareImage(o: CfOptions): Promise<string> {
  const useRef = o.references.length > 0 || o.aspectRatio !== "1:1";
  const model = useRef ? o.refModel : o.model;
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(o.accountId)}/ai/run/${model}`;
  const auth = { Authorization: `Bearer ${o.token}` };

  if (!useRef) {
    // FLUX.1 Schnell solo acepta "prompt" y "steps".
    const body: Record<string, unknown> = { prompt: o.prompt.slice(0, 2048) };
    if (model.includes("flux-1-schnell")) body.steps = 4;
    const res = await fetch(url, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return readImage(res);
  }

  const [w, h] = SIZES[o.aspectRatio] || SIZES["1:1"];
  const form = new FormData();
  form.append("prompt", o.prompt.slice(0, 2048));
  form.append("width", String(w));
  form.append("height", String(h));
  o.references.slice(0, 4).forEach((ref, i) => {
    form.append(`input_image_${i}`, dataUrlToBlob(ref), `referencia-${i}.jpg`);
  });

  // No ponemos Content-Type: fetch lo genera con el "boundary" del formulario.
  const res = await fetch(url, { method: "POST", headers: auth, body: form });
  return readImage(res);
}
