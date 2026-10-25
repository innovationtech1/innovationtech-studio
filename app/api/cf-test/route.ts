// «Probar conexión»: revisa el token, el Account ID y el permiso de Workers AI,
// y explica en español qué hay que corregir.

export const dynamic = "force-dynamic";

type Check = { ok: boolean; label: string; help?: string };

export async function POST(req: Request) {
  const { accountId: rawId, token: rawToken } = await req.json().catch(() => ({}));
  const accountId = String(rawId || "").trim();
  const token = String(rawToken || "").trim();
  const checks: Check[] = [];

  // 1) Formato del Account ID
  const idOk = /^[0-9a-f]{32}$/i.test(accountId);
  checks.push({
    ok: idOk,
    label: "Account ID con el formato correcto",
    help: idOk ? undefined : "Debe tener 32 letras y números (0-9, a-f). Cópialo de nuevo desde Cloudflare, sin espacios.",
  });
  if (!token) {
    checks.push({ ok: false, label: "Token", help: "Pega el token de API de Workers AI." });
    return Response.json({ ok: false, checks });
  }

  // 2) ¿El token es válido? (los tokens pueden ser de usuario o de la cuenta)
  const headers = { Authorization: `Bearer ${token}` };
  let tokenOk = false;
  try {
    const urls = [
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      ...(idOk ? [`https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens/verify`] : []),
    ];
    for (const u of urls) {
      const r = await fetch(u, { headers, cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.success && d?.result?.status === "active") {
        tokenOk = true;
        break;
      }
    }
  } catch {
    /* sin red */
  }
  checks.push({
    ok: tokenOk,
    label: "Token válido y activo",
    help: tokenOk ? undefined : "El token no es válido, se borró o expiró. Crea uno nuevo («Create a Workers AI API Token») y pégalo completo.",
  });

  // 3) ¿Puede usar Workers AI en esa cuenta? (una prueba mínima)
  let aiOk = false;
  let aiHelp = "";
  if (idOk && tokenOk) {
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.2-1b-instruct`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Responde solo: hola" }], max_tokens: 5 }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.success !== false) aiOk = true;
      else {
        const msg = String(d?.errors?.[0]?.message || r.status).toLowerCase();
        if (msg.includes("could not route") || msg.includes("identifier") || r.status === 404)
          aiHelp = "El Account ID no corresponde a tu cuenta. Cópialo de la página Workers AI → «Use REST API».";
        else if (msg.includes("authentication") || r.status === 401 || r.status === 403)
          aiHelp = "El token no tiene permiso de Workers AI para esta cuenta. Al crearlo, elige Account → Workers AI → Read y Edit, e incluye tu cuenta en «Account Resources».";
        else if (msg.includes("neurons") || msg.includes("capacity") || msg.includes("limit"))
          aiHelp = "Tu cuenta está bien, pero se acabó el límite gratuito de hoy. Se reinicia a medianoche UTC.";
        else aiHelp = `Cloudflare respondió: ${d?.errors?.[0]?.message || r.status}`;
      }
    } catch {
      aiHelp = "No se pudo contactar a Cloudflare. Revisa tu conexión e intenta de nuevo.";
    }
  } else aiHelp = "Primero corrige lo anterior.";
  checks.push({ ok: aiOk, label: "Permiso para usar la IA de Cloudflare (Workers AI)", help: aiOk ? undefined : aiHelp });

  return Response.json({ ok: checks.every((c) => c.ok), checks });
}
