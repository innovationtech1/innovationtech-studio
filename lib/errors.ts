// Traduce los errores más comunes de los proveedores a mensajes claros en español.

export function friendlyError(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (m.includes("credit balance is too low"))
    return "Tu cuenta de Anthropic no tiene crédito. Agrégalo en console.anthropic.com → Plans & Billing y vuelve a intentar.";
  if (m.includes("requires credit") || m.includes("insufficient credit"))
    return "Tu cuenta de Replicate no tiene crédito. Agrégalo en replicate.com/account/billing, o usa Cloudflare (gratis) para imágenes en Configuración.";
  if (m.includes("invalid x-api-key") || m.includes("authentication_error"))
    return "La clave de Anthropic no es válida. Revísala en Configuración.";
  if (m.includes("unauthenticated") || m.includes("invalid token") || m.includes("authentication error"))
    return "La clave o el token no son válidos. Revísalos en Configuración.";
  if (m.includes("neurons") || m.includes("daily free allocation") || m.includes("capacity"))
    return "Se acabó el límite gratuito de hoy en Cloudflare. Se reinicia a medianoche UTC; mientras, puedes usar Replicate.";
  return raw || "Algo salió mal. Intenta de nuevo.";
}
