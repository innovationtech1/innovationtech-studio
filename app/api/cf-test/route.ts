// «Probar conexión»: revisa el token, el Account ID y el permiso de Workers AI,
// y explica en español qué hay que corregir. La revisión vive en lib/probar-cloudflare.ts.
import { probarCloudflare } from "@/lib/probar-cloudflare";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { accountId, token } = await req.json().catch(() => ({}));
  return Response.json(await probarCloudflare(String(accountId || ""), String(token || "")));
}
