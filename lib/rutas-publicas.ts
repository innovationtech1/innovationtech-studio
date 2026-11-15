// Páginas que cualquiera puede abrir sin iniciar sesión (la puerta de las cuentas no las tapa).
// Stripe pide que los Términos y la Política de privacidad se puedan leer sin cuenta.
// Si agregas una aquí, agrégala también en public/sw.js (LEGALES).

export const RUTAS_PUBLICAS = ["/terminos", "/privacidad", "/creditos"] as const;

export function esRutaPublica(ruta: string | null | undefined): boolean {
  if (!ruta) return false;
  const limpia = ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta;
  return (RUTAS_PUBLICAS as readonly string[]).includes(limpia);
}
