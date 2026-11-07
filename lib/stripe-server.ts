import "server-only";
import Stripe from "stripe";

// Conexión con Stripe desde el servidor. La clave secreta (STRIPE_SECRET_KEY) vive solo en
// .env.local y en las variables de entorno de Netlify; nunca llega al navegador.

// Versión de la API fijada a mano: es la que trae el paquete stripe 23.1.0. Si se actualiza el
// paquete y cambia, TypeScript marcará error aquí para que se revise el código antes de cambiarla.
// (Al crear el webhook en Stripe, elige esta misma versión.)
export const VERSION_API_STRIPE: Stripe.LatestApiVersion = "2026-10-28.endive";

export const SIN_CONFIGURAR = "El pago con tarjeta todavía no está configurado.";

export function stripeConfigurado(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// ¿Las claves de Stripe son las reales (cobran de verdad)? Con claves de prueba (sk_test_…) o sin
// clave, false. Los datos guardados de un modo no sirven en el otro.
export function stripeModoLive(): boolean {
  const clave = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  return clave.startsWith("sk_live_") || clave.startsWith("rk_live_");
}

let cliente: Stripe | null = null;

// Se crea la primera vez que se usa y luego se reutiliza.
export function stripe(): Stripe {
  if (cliente) return cliente;
  const clave = process.env.STRIPE_SECRET_KEY;
  if (!clave) throw new Error("Falta STRIPE_SECRET_KEY: el pago con tarjeta no está configurado.");
  cliente = new Stripe(clave, { apiVersion: VERSION_API_STRIPE, maxNetworkRetries: 2 });
  return cliente;
}
