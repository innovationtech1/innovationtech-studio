import { jsonAcceso, requireAccess } from "@/lib/account";
import { clavePropiaCF, getCreds, refund } from "@/lib/cf-auth";
import { cloudflareImage, isFlagged } from "@/lib/cloudflare";
import { instruccionEdicion, validarEdicion } from "@/lib/editar-ia";
import { jsonError } from "@/lib/replicate";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MODELO_EDITAR = "@cf/black-forest-labs/flux-2-klein-4b";

// «Editar con IA»: recibe la foto (achicada) y el pedido con palabras, y devuelve la foto editada.
// Cada edición cuenta como 1 imagen del plan; si no sale, se devuelve. La foto no se guarda.
export async function POST(req: Request) {
  const v = validarEdicion(await req.json().catch(() => null));
  if (!v.ok) return Response.json({ error: v.error, ...(v.codigo ? { codigo: v.codigo } : {}) }, { status: 400 });

  const acceso = await requireAccess(req, { herramienta: "imagenes", contador: "imagenes", clavePropia: clavePropiaCF(req), cloudflare: true });
  if (!acceso.ok) return jsonAcceso(acceso);
  const c = getCreds(req, "image", 1, acceso.cfGuardada);
  if ("error" in c) {
    await acceso.devolver();
    return jsonError(c.error, c.status);
  }

  try {
    const url = await cloudflareImage({
      accountId: c.accountId,
      token: c.token,
      model: MODELO_EDITAR,
      refModel: MODELO_EDITAR,
      prompt: instruccionEdicion(v.plan.tipo, v.pedido),
      aspectRatio: "1:1",
      references: [v.foto],
      size: [v.plan.ancho, v.plan.alto],
    });
    return Response.json({ url, tipo: v.plan.tipo, ...(v.plan.formato ? { formato: v.plan.formato } : {}) });
  } catch (e) {
    if (c.demo) refund(req, "image");
    await acceso.devolver();
    const msg = (e as Error).message || "";
    return Response.json(
      { error: isFlagged(msg) ? "El filtro de seguridad bloqueó este cambio. Prueba pidiéndolo de otra forma." : "No pude editar la foto en este momento." },
      { status: isFlagged(msg) ? 422 : 502 }
    );
  }
}
