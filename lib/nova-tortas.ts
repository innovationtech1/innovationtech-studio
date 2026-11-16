// NOVA en Tortas Tortuga: la misma asistente de Studio, con el manual de Tortas Tortuga (sus «fichas»).
// La página de Tortas Tortuga (GitHub Pages, sin servidor) llama a /api/nova/tortas; aquí están las
// instrucciones, la revisión de lo que manda el navegador y los topes. Funciones puras, para probarlas.
// Diseño: https://claude.ai/artifact/2DsL9xSj6jVcJtj1veDpHk

import datos from "./nova-tortas-fichas.json";

export type Msg = { role: "user" | "assistant"; content: string };
type Ficha = { id: string; categoria: string; titulo: string; contenido: string; activa: boolean };

// Las fichas activas (un tema por ficha: negocio, menú, entrega, cobro). Son pocas: van todas en cada pedido.
export const FICHAS_TORTAS: Ficha[] = (datos.fichas as Ficha[]).filter((f) => f.activa);

// ---------- Quién puede llamar ----------

// Solo la página publicada de Tortas Tortuga (y localhost al probar en la computadora).
export const ORIGENES_TORTAS = ["https://innovationtech1.github.io"];

export function origenPermitido(origin: string | null | undefined, produccion: boolean = process.env.NODE_ENV === "production"): string | null {
  if (!origin) return null;
  if (ORIGENES_TORTAS.includes(origin)) return origin;
  if (!produccion && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

// ---------- Topes (paga la cuenta de Cloudflare de InnovationTECH) ----------

export const ESPACIO_TORTAS_MS = 1500; // 1 mensaje cada 1.5 s por persona
export const TOPE_TORTAS_DIA = { pedidos: 80, letras: 16_000 } as const; // por persona al día (Chicago)
export const ESPACIO_VOZ_TORTAS_MS = 700; // la voz se pide por frases, más seguido que en Studio
export const TOPE_VOZ_TORTAS_DIA = { pedidos: 250, letras: 40_000 } as const;
export const MAX_MENSAJES = 12; // intervenciones que se recuerdan
export const MAX_LETRAS_MENSAJE = 600;

// ---------- Lo que manda el navegador ----------

// Lo que la app sabe en ese momento y NOVA necesita para armar el pedido: el menú guardado, las zonas y
// los días y horas que se pueden programar. Son textos que arma el navegador (js/nova.js de Tortas Tortuga).
export type ContextoTortas = { menu: string; zonas: string; fechas: string; horas: string };
export const MAX_CONTEXTO = { menu: 5000, zonas: 400, fechas: 400, horas: 400 } as const;

// Textos del navegador: sin caracteres de control y con tope de largo. Un contexto falso solo engaña a
// quien lo manda: el pedido y el total los revisa y calcula la app contra su base de datos, no NOVA.
export function limpiarContexto(x: unknown): ContextoTortas | null {
  if (!x || typeof x !== "object") return null;
  const c = x as Record<string, unknown>;
  const t = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[^\S\n]+/g, " ").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, max) : "");
  const r = { menu: t(c.menu, MAX_CONTEXTO.menu), zonas: t(c.zonas, MAX_CONTEXTO.zonas), fechas: t(c.fechas, MAX_CONTEXTO.fechas), horas: t(c.horas, MAX_CONTEXTO.horas) };
  return r.menu ? r : null;
}

export type Platica = { ok: true; history: Msg[]; english: boolean; letras: number; contexto: ContextoTortas | null } | { ok: false; error: string };

// No se confía en el navegador: solo mensajes del cliente y de NOVA, cortos, y los últimos 12.
export function validarPlatica(cuerpo: unknown): Platica {
  const c = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as { messages?: unknown; lang?: unknown; contexto?: unknown };
  const history: Msg[] = (Array.isArray(c.messages) ? c.messages : [])
    .filter((m): m is Msg => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && !!m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_LETRAS_MENSAJE) }))
    .slice(-MAX_MENSAJES);
  const ultimo = history[history.length - 1];
  if (!ultimo || ultimo.role !== "user") return { ok: false, error: "Escribe o di tu mensaje." };
  return { ok: true, history, english: c.lang === "en", letras: ultimo.content.length, contexto: limpiarContexto(c.contexto) };
}

// ---------- Instrucciones ----------

export const PERSONA_TORTAS =
  "Eres NOVA, la asistente de Tortas Tortuga (San Antonio, Texas), creada por InnovationTECH. Ayudas a los clientes a conocer el menú y a programar su comida a domicilio.";

// Cómo le pasa NOVA el pedido a la app: una línea final que el cliente no ve (js/nova-pedido.js la lee y la revisa).
export const FORMATO_PEDIDO =
  'Al final de CADA respuesta, en una línea aparte, escribe PEDIDO: y un JSON de una sola línea con todo lo que el cliente ha pedido hasta ahora en esta plática, así: PEDIDO: {"zona":null,"fecha":null,"hora":null,"direccion":null,"items":[{"id":"original","opcion":3,"cantidad":5}]}. ' +
  "«id» es el id del producto en el MENÚ DE LA APP y «opcion» es el número de la opción. «zona» es el id de la zona, «fecha» va como AAAA-MM-DD y «hora» como HH:MM en 24 horas; usa solo los valores de las listas. Lo que el cliente no ha dicho va en null, y sin productos «items» va vacío. " +
  "Nunca menciones ni leas esa línea, y no digas totales: la app muestra el resumen con el total exacto y le pide al cliente confirmar.";

export function instruccionesTortas(o: { english: boolean; hoy: string; contexto?: ContextoTortas | null }): string {
  const c = o.contexto;
  return [
    PERSONA_TORTAS,
    "Tu tono es cálido, alegre y muy breve: una o dos frases, como en una llamada. Sin Markdown, sin listas largas y sin emojis, porque tus respuestas también se dicen en voz alta.",
    "Usa SOLO la información de las fichas de abajo. Nunca inventes productos, precios, horarios, zonas ni promociones. Si no está en las fichas, di que no tienes ese dato y da el teléfono del negocio.",
    "Los nombres de los productos se dicen tal como están en el menú. Cuando un producto tiene varias opciones, pregunta cuál quiere.",
    "Para programar una orden necesitas: zona, día, hora, productos con cantidades y la dirección. Pide lo que falte, una cosa a la vez. Recuerda lo que el cliente ya dijo.",
    "Tú no cobras ni guardas pedidos: el total exacto y el pago los muestra la app. No pidas datos de tarjetas ni datos sensibles. No expliques cómo funcionas por dentro.",
    "Si te piden algo que no es de Tortas Tortuga, contesta en una frase y regresa a la comida.",
    `Hoy es ${o.hoy} (hora de San Antonio).`,
    o.english ? "Answer in English unless the customer writes in Spanish." : "Responde en español, salvo que el cliente escriba en inglés.",
    "FICHAS DE TORTAS TORTUGA:",
    ...FICHAS_TORTAS.map((f) => `## ${f.titulo}\n${f.contenido}`),
    ...(c
      ? [
          `MENÚ DE LA APP (id | nombre | opciones con precio). Si un precio difiere de las fichas, manda este:\n${c.menu}`,
          `ZONAS (id = nombre): ${c.zonas}`,
          `DÍAS QUE SE PUEDEN PROGRAMAR (fecha = nombre): ${c.fechas}`,
          `HORAS: ${c.horas}`,
          FORMATO_PEDIDO,
        ]
      : []),
  ].join("\n\n");
}

// El día y la hora de San Antonio, para que NOVA entienda «mañana» o «el sábado».
export function hoyEnSanAntonio(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "America/Chicago", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(ahora);
}
