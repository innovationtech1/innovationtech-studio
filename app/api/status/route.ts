import { demoEnabled, demoLimits, demoRemaining } from "@/lib/cf-auth";

export const dynamic = "force-dynamic";

// Informa si el modo demo está disponible y cuántos usos le quedan hoy a esta persona.
export async function GET(req: Request) {
  const demo = demoEnabled();
  return Response.json({
    demo,
    limits: demo ? demoLimits() : null,
    remaining: demo
      ? { text: demoRemaining(req, "text"), image: demoRemaining(req, "image"), voice: demoRemaining(req, "voice") }
      : null,
  });
}
