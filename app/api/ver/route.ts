import { jsonAcceso, requireAccess } from "@/lib/account";
import { clavePropiaCF, getCreds, refund } from "@/lib/cf-auth";
import { jsonError } from "@/lib/replicate";
import { cuerpoVision, esFaltaDeLicencia, leerVision, urlVision, validarFotos, verLote } from "@/lib/ver-fotos";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// «NOVA ve tus fotos»: una frase corta por foto (o null si esa foto no se pudo ver).
// Un lote cuenta como 1 texto; si no se vio ninguna, se devuelve. Las fotos no se guardan.
export async function POST(req: Request) {
  const v = validarFotos(await req.json().catch(() => null));
  if (!v.ok) return jsonError(v.error, 400);
  const acceso = await requireAccess(req, { herramienta: "textos", contador: "textos", clavePropia: clavePropiaCF(req), cloudflare: true });
  if (!acceso.ok) return jsonAcceso(acceso);
  const c = getCreds(req, "text", 1, acceso.cfGuardada);
  if ("error" in c) {
    await acceso.devolver();
    return jsonError(c.error, c.status);
  }

  let aviso = ""; // el primer motivo de fallo que dio Cloudflare
  const descripciones = await verLote(v.fotos, async (foto) => {
    const res = await fetch(urlVision(c.accountId), {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpoVision(foto)),
      signal: AbortSignal.timeout(20_000),
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok || datos?.success === false) {
      aviso ||= String(datos?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`);
      throw new Error(aviso);
    }
    return leerVision(datos);
  });

  if (descripciones.every((d) => d === null)) {
    if (c.demo) refund(req, "text");
    await acceso.devolver();
    return Response.json({
      descripciones,
      error: esFaltaDeLicencia(aviso)
        ? "Ver fotos todavía no está activado en esta cuenta de Cloudflare."
        : "No pude ver las fotos en este momento.",
      ...(esFaltaDeLicencia(aviso) ? { codigo: "SIN_LICENCIA" } : {}),
    });
  }
  return Response.json({ descripciones });
}
