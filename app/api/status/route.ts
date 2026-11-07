import { estadoDemo } from "@/lib/cf-auth";

export const dynamic = "force-dynamic";

// Informa si el modo demo está disponible y cuántos usos le quedan hoy a esta persona.
// Con las cuentas activas siempre dice demo: false (sin límites de demo).
export async function GET(req: Request) {
  return Response.json(estadoDemo(req));
}
