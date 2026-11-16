// Sugerencias de NOVA cuando el cliente lleva un rato sin hacer nada en el Asistente.
// Salen de una lista local (no gastan IA): usan el plan del cliente y el nombre de su negocio.
// Funciones puras para poder probarlas.

import type { CuentaNova } from "./nova";

export type Sugerencia = { id: string; texto: string; mensaje: string }; // mensaje: lo que se le manda a NOVA

// 45 s sin actividad y como máximo una sugerencia cada 3 min
export const INACTIVO_MS = 45_000;
export const ENTRE_SUGERENCIAS_MS = 180_000;

// Cuánto le queda de un contador (lo del mes + saldo de paquetes); undefined si su plan no lo tiene.
function quedan(c: CuentaNova, k: string): number | undefined {
  const limite = c.limites[k];
  const saldo = c.saldo[k] ?? 0;
  if (limite === undefined && !saldo) return undefined;
  return Math.max(0, (limite ?? 0) - (c.uso[k] ?? 0)) + saldo;
}

// Viernes, sábado o domingo en San Antonio (hora de Chicago)
function esFinDeSemana(ahora: Date): boolean {
  const dia = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(ahora);
  return dia === "Fri" || dia === "Sat" || dia === "Sun";
}

export function SUGERENCIAS(c: CuentaNova | null, marca: string, ahora: Date = new Date()): Sugerencia[] {
  const negocio = marca.trim().slice(0, 60) || "mi negocio";
  const lista: Sugerencia[] = [];

  // Primero las que dependen del plan o del día (son las más útiles en este momento)
  if (c) {
    const tomas = quedan(c, "tomas_ia");
    if (tomas !== undefined && tomas > 0) {
      lista.push({
        id: "reel-ia",
        texto: "Tienes tomas de video con IA disponibles. ¿Armamos un reel?",
        mensaje: "Dame una idea de reel con video con IA para mi negocio: las tomas y el texto de cada una",
      });
    }
    const textos = quedan(c, "textos");
    const limite = c.limites.textos ?? 0;
    if (textos !== undefined && textos > 0 && (textos <= 20 || textos <= limite * 0.1)) {
      lista.push({
        id: "textos-pocos",
        texto: `Te quedan ${textos} textos este mes: aprovecha uno en tu mejor post.`,
        mensaje: "Escribe el mejor post posible para mi negocio esta semana, uno que venda",
      });
    }
  }
  if (esFinDeSemana(ahora)) {
    lista.push({
      id: "fin-de-semana",
      texto: "Llega el fin de semana: ¿un post para invitar a tus clientes?",
      mensaje: `Escribe un post para el fin de semana que invite a los clientes de ${negocio}`,
    });
  }

  // Ideas generales (sirven para cualquier plan, y también sin datos del plan)
  lista.push(
    {
      id: "ideas-semana",
      texto: "¿Te armo las ideas de publicaciones de esta semana?",
      mensaje: "Dame 5 ideas de publicaciones para esta semana para mi negocio",
    },
    {
      id: "presentar",
      texto: "Un post que presente tu negocio a clientes nuevos.",
      mensaje: `Escribe un post que presente ${negocio} a clientes nuevos`,
    },
    {
      id: "promocion",
      texto: "¿Escribimos una promoción con llamada a la acción?",
      mensaje: "Escribe una promoción corta para las redes de mi negocio con llamada a la acción",
    },
    {
      id: "guion-reel",
      texto: "Un guion de reel de 30 segundos para tu producto estrella.",
      mensaje: `Crea el guion de un reel de 30 segundos para el producto estrella de ${negocio}`,
    },
    {
      id: "perfil",
      texto: "¿Mejoramos la descripción de tu perfil?",
      mensaje: `Escribe la descripción del perfil de Instagram de ${negocio}`,
    },
    {
      id: "resena",
      texto: "Te ayudo a responder con amabilidad la reseña de un cliente.",
      mensaje: "Ayúdame a responder con amabilidad la reseña de un cliente",
    },
    {
      id: "hashtags",
      texto: "Hashtags para tu próxima publicación.",
      mensaje: "Dame 10 hashtags para la próxima publicación de mi negocio",
    },
    {
      id: "historias",
      texto: "Ideas para tus historias de hoy.",
      mensaje: "Dame 3 ideas de historias de Instagram para hoy para mi negocio",
    },
  );
  return lista;
}

// La primera que no ha visto; cuando ya vio todas, vuelve a empezar.
export function siguienteSugerencia(lista: Sugerencia[], vistas: string[]): Sugerencia | null {
  return lista.find((s) => !vistas.includes(s.id)) ?? lista[0] ?? null;
}

export function debeSugerir(s: {
  inactivoMs: number;
  desdeUltimaMs: number;
  escribiendo: boolean;
  transmitiendo: boolean;
  visible: boolean;
  textoEnCaja: boolean;
}): boolean {
  if (s.escribiendo || s.transmitiendo || !s.visible || s.textoEnCaja) return false;
  return s.inactivoMs >= INACTIVO_MS && s.desdeUltimaMs >= ENTRE_SUGERENCIAS_MS;
}

// Las ideas de imagen de una respuesta: las líneas «PROMPT DE IMAGEN: …» (máximo 3).
export const MAX_IDEAS_IMAGEN = 3;
export function ideasDeImagen(texto: string): string[] {
  const out: string[] = [];
  for (const m of texto.matchAll(/^[ \t*_>-]*PROMPT DE IMAGEN:?[*_]*[ \t]*(.*)$/gim)) {
    const idea = m[1].replace(/\*+/g, "").trim();
    if (idea) out.push(idea);
    if (out.length === MAX_IDEAS_IMAGEN) break;
  }
  return out;
}

// El texto de la respuesta sin las líneas de ideas de imagen (para mostrar, copiar y leer).
export const sinIdeasDeImagen = (texto: string) => texto.replace(/^[ \t*_>-]*PROMPT DE IMAGEN:?.*(?:\r?\n|$)/gim, "").trim();
