// Ayudante para llamar a Replicate con la clave del propio usuario.
// La clave llega en cada petición y nunca se guarda en el servidor.

const API = "https://api.replicate.com/v1";

export type Prediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
};

// Acepta "dueño/modelo" (modelo oficial) o "dueño/modelo:version".
export async function createPrediction(
  token: string,
  model: string,
  input: Record<string, unknown>,
  wait: boolean
): Promise<Prediction> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (wait) headers["Prefer"] = "wait=60";

  let url: string;
  let body: Record<string, unknown>;
  if (model.includes(":")) {
    url = `${API}/predictions`;
    body = { version: model.split(":")[1], input };
  } else {
    url = `${API}/models/${model}/predictions`;
    body = { input };
  }

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.title || `Replicate respondió ${res.status}`);
  }
  return data as Prediction;
}

export async function getPrediction(token: string, id: string): Promise<Prediction> {
  const res = await fetch(`${API}/predictions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `Replicate respondió ${res.status}`);
  return data as Prediction;
}

// Los modelos devuelven la salida en distintos formatos: texto, lista o objeto.
export function outputUrls(output: unknown): string[] {
  if (!output) return [];
  if (typeof output === "string") return [output];
  if (Array.isArray(output)) return output.flatMap(outputUrls);
  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.url === "string") return [o.url];
    return Object.values(o).flatMap(outputUrls);
  }
  return [];
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
