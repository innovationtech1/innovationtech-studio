import { baseDeEntorno, procesarAviso } from "@/lib/video-ia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Aviso (webhook) de fal.ai cuando termina una toma. Se revisa la firma de fal y el secreto del trabajo.
export async function POST(req: Request) {
  const cuerpo = await req.text();
  const url = new URL(req.url);
  const r = await procesarAviso(url, req.headers, cuerpo, { base: baseDeEntorno() ?? url.origin });
  return new Response(null, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
