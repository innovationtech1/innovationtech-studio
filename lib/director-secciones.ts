// Director con IA en Textos e Imágenes (lógica pura, con pruebas).
// Textos: la orden elige la red social sola y después corrige el texto ya creado («más corto», «en inglés»…).
// Imágenes: la orden (en español, escrita o dictada) llena la descripción en inglés, el formato y la cantidad;
// la app pregunta antes de gastar imágenes.

const plano = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// Cómo dice la gente cada red social. La llave es el nombre tal como aparece en la app.
const FORMAS: Record<string, string[]> = {
  Instagram: ["instagram", "insta", "ig"],
  Facebook: ["facebook", "face", "fb"],
  TikTok: ["tiktok", "tik tok"],
  LinkedIn: ["linkedin", "linked in"],
  "X (Twitter)": ["twitter", "tuit", "tweet"],
  YouTube: ["youtube", "you tube"],
  "Anuncio pagado": ["anuncio pagado", "anuncio de paga", "publicidad pagada", "ads"],
  Email: ["email", "e-mail", "correo", "mail"],
};

// La red social que nombra la orden (palabra completa), o null si no nombra ninguna de la lista.
export function plataformaDe(orden: string, plataformas: string[]): string | null {
  const texto = ` ${plano(orden).replace(/[^a-z0-9-]+/g, " ")} `;
  for (const p of plataformas) {
    for (const forma of FORMAS[p] ?? [plano(p)]) if (texto.includes(` ${forma} `)) return p;
  }
  return null;
}

// ---------- Textos: corregir lo ya creado ----------

export const MAX_TEXTO_AJUSTE = 6000; // lo más largo que se manda a corregir

export const AJUSTES_RAPIDOS: { nombre: string; orden: string }[] = [
  { nombre: "Más corto", orden: "Hazlo más corto, a la mitad, sin perder la oferta." },
  { nombre: "Con emojis", orden: "Agrégale emojis que vayan con el mensaje, sin exagerar." },
  { nombre: "Más formal", orden: "Hazlo más formal y profesional." },
  { nombre: "Más divertido", orden: "Hazlo más divertido y cercano." },
  { nombre: "En inglés", orden: "Tradúcelo al inglés." },
];

export function instruccionesAjuste(o: { texto: string; ingles: boolean }): { system: string; user: (orden: string) => string } {
  const system = [
    "Eres editor de textos de marketing para pequeños negocios.",
    "Recibes un texto ya escrito y una orden de cambio. Devuelve el texto COMPLETO con el cambio aplicado, listo para publicar.",
    "Responde SOLO con el texto corregido: sin explicaciones, sin comillas, sin encabezados nuevos.",
    "Cambia solo lo que la orden pide; conserva la oferta, los datos (precios, fechas, lugares) y la estructura.",
    "Si el texto tiene líneas que empiezan con 'PROMPT DE IMAGEN:' o 'PROMPT DE VIDEO:', consérvalas tal cual (esas etiquetas exactas, su contenido en inglés), salvo que la orden pida cambiarlas.",
    "No inventes testimonios, precios ni datos que no estén en el texto.",
    o.ingles ? "If the order does not name a language, keep the language of the text." : "Si la orden no nombra un idioma, conserva el idioma del texto.",
  ].join("\n");
  return { system, user: (orden) => `Orden: ${orden}\n\nTexto:\n${o.texto.slice(0, MAX_TEXTO_AJUSTE)}` };
}

// El texto corregido, o null si la IA no devolvió nada útil.
export function validarAjuste(respuesta: unknown, anterior: string): string | null {
  if (typeof respuesta !== "string") return null;
  const t = respuesta
    .trim()
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();
  if (!t || t === anterior.trim()) return null;
  return t;
}

// ---------- Imágenes ----------

export const FORMATOS_IMAGEN = ["1:1", "4:5", "9:16", "16:9"] as const;
export type FormatoImagen = (typeof FORMATOS_IMAGEN)[number];

export type OrdenImagen = {
  descripcion: string; // en inglés, lista para el generador
  formato?: FormatoImagen; // undefined = no se pidió: se deja el que está
  cantidad?: number; // 1 a 4
  marca?: boolean; // aplicar los colores de la marca
  mensaje: string;
};

export function validarImagen(json: unknown): OrdenImagen | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const descripcion = typeof j.descripcion === "string" ? j.descripcion.trim().slice(0, 1000) : "";
  if (!descripcion) return null;
  const formato = FORMATOS_IMAGEN.find((f) => f === j.formato);
  const cantidad = typeof j.cantidad === "number" && Number.isInteger(j.cantidad) && j.cantidad >= 1 && j.cantidad <= 4 ? j.cantidad : undefined;
  return {
    descripcion,
    formato,
    cantidad,
    marca: typeof j.marca === "boolean" ? j.marca : undefined,
    mensaje: typeof j.mensaje === "string" ? j.mensaje.trim().slice(0, 300) : "",
  };
}

export type ImagenActual = { descripcion: string; formato: string; cantidad: number; marca: boolean; fotos: number };

export function instruccionesImagen(o: { actual: ImagenActual; marca?: string; ingles: boolean }): { system: string; user: (orden: string) => string } {
  const system = [
    "Eres director de arte de una agencia de marketing para pequeños negocios.",
    "La persona te dice, con sus palabras, qué imagen quiere. Tú preparas el pedido para un generador de imágenes.",
    "Responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma:",
    '{"descripcion": "texto", "formato": "1:1" | "4:5" | "9:16" | "16:9", "cantidad": 1-4, "marca": true | false, "mensaje": "texto"}',
    '- "descripcion": SIEMPRE EN INGLÉS (English), una sola línea, estilo fotografía publicitaria: sujeto, entorno, luz, composición. Sin texto dentro de la imagen.',
    '- "formato": 1:1 = cuadrado (post); 4:5 = vertical (feed); 9:16 = historia o reel; 16:9 = horizontal (YouTube, web). Inclúyelo SOLO si la persona lo pide o lo da a entender (historia, reel, portada…).',
    '- "cantidad": cuántas opciones quiere (1 a 4). Inclúyela SOLO si la pide.',
    '- "marca": true para usar los colores de su marca, false para no usarlos. Inclúyela SOLO si lo pide.',
    `- "mensaje": una frase corta ${o.ingles ? "in English" : "en español"} que diga qué preparaste.`,
    "Si la orden es un cambio sobre lo que ya hay («ahora vertical», «con luz más cálida», «2 opciones»), parte de la descripción actual y aplícale el cambio.",
    o.actual.fotos > 0
      ? `La persona subió ${o.actual.fotos} foto(s) propia(s) como base: la descripción debe decir qué hacer con ellas (por ejemplo «place this product on…»).`
      : "",
    "No pidas rostros de personas reales con nombre, marcas ajenas ni personajes con derechos.",
    o.marca ? `\nContexto de la marca:\n${o.marca}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const ahora = `Lo que hay ahora → descripción: ${o.actual.descripcion || "(vacía)"} · formato: ${o.actual.formato} · cantidad: ${o.actual.cantidad} · colores de marca: ${o.actual.marca ? "sí" : "no"}`;
  return { system, user: (orden) => `Orden: ${orden}\n\n${ahora}` };
}

// Antes de gastar: la pregunta que ve la persona
export const confirmarImagen = (n: number) =>
  n === 1 ? "¿Crear 1 imagen? Usa 1 imagen de tu plan." : `¿Crear ${n} imágenes? Usa ${n} imágenes de tu plan.`;
