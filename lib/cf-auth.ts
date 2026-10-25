// Credenciales de Cloudflare para cada pedido:
// 1) las del usuario (encabezados x-cf-account / x-cf-token), o
// 2) MODO DEMO: las del dueño de la plataforma (variables de entorno CF_ACCOUNT_ID y CF_API_TOKEN),
//    con un límite diario por persona para que alcance para todos.
//
// Para activar el modo demo en Vercel: Settings → Environment Variables →
//   CF_ACCOUNT_ID = tu Account ID   ·   CF_API_TOKEN = tu token de Workers AI
// Opcional: DEMO_LIMIT_TEXT, DEMO_LIMIT_IMAGE, DEMO_LIMIT_VOICE (usos por persona al día), DEMO_MODE=off para apagarlo.

export type Kind = "text" | "image" | "voice";

const LIMITS: Record<Kind, number> = {
  text: Number(process.env.DEMO_LIMIT_TEXT || 15),
  image: Number(process.env.DEMO_LIMIT_IMAGE || 8),
  voice: Number(process.env.DEMO_LIMIT_VOICE || 5),
};

export const demoEnabled = () =>
  !!process.env.CF_ACCOUNT_ID && !!process.env.CF_API_TOKEN && (process.env.DEMO_MODE || "on") !== "off";

export const demoLimits = () => ({ ...LIMITS });

// Conteo en memoria por persona (dirección IP) y día. Es aproximado: cada servidor lleva su propia cuenta,
// pero el plan gratuito de Cloudflare pone de todos modos un tope diario que no genera cobros.
const usage = new Map<string, number>();
let usageDay = "";
const today = () => new Date().toISOString().slice(0, 10);

function who(req: Request) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "anon";
}

export function demoRemaining(req: Request, kind: Kind) {
  if (usageDay !== today()) {
    usage.clear();
    usageDay = today();
  }
  return Math.max(0, LIMITS[kind] - (usage.get(`${who(req)}|${kind}`) || 0));
}

export type Creds = { accountId: string; token: string; demo: boolean; remaining?: number };

export function getCreds(req: Request, kind: Kind, units = 1): Creds | { error: string; status: number } {
  const accountId = req.headers.get("x-cf-account")?.trim();
  const token = req.headers.get("x-cf-token")?.trim();
  if (accountId && token) return { accountId, token, demo: false };

  if (!demoEnabled()) {
    return { error: "Faltan tu Account ID o tu token de Cloudflare. Configúralos en ⚙️ Configuración (es gratis).", status: 401 };
  }
  const left = demoRemaining(req, kind);
  if (left < units) {
    const what = kind === "text" ? "textos" : kind === "image" ? "imágenes" : "voces";
    return {
      error: `DEMO_LIMIT: Llegaste al límite diario del modo demo para ${what}. Configura tu propia cuenta gratis de Cloudflare en ⚙️ Configuración para seguir sin límites (toma 5 minutos), o vuelve mañana.`,
      status: 429,
    };
  }
  const key = `${who(req)}|${kind}`;
  usage.set(key, (usage.get(key) || 0) + units);
  return { accountId: process.env.CF_ACCOUNT_ID!, token: process.env.CF_API_TOKEN!, demo: true, remaining: left - units };
}

// Si el pedido falló, devolvemos el uso consumido (para no gastar el límite en errores).
export function refund(req: Request, kind: Kind, units = 1) {
  const key = `${who(req)}|${kind}`;
  usage.set(key, Math.max(0, (usage.get(key) || 0) - units));
}
